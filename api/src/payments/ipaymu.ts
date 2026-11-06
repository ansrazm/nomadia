import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export class GatewayError extends Error {}

export interface CheckoutInput {
  orderId: string;
  total: number;
  summary: string;
  buyerName: string;
  buyerEmail: string;
  buyerPhone: string;
  returnUrl: string;
  cancelUrl: string;
  notifyUrl: string;
}

/** Pembayaran QRIS langsung (Direct Payment): QR ditampilkan di halaman sendiri, bukan halaman iPaymu. */
export interface DirectQrisInput {
  orderId: string;
  total: number;
  buyerName: string;
  buyerEmail: string;
  buyerPhone: string;
  notifyUrl: string;
}

export interface DirectQrisResult {
  transactionId: number;
  referenceId: string;
  via: string;
  channel: string;
  paymentNo: string | null;
  url: string | null;
  /** Isi QR. Di sandbox berupa teks demo, BUKAN payload QRIS asli; jangan dirender sendiri kecuali berawalan 000201. */
  qrString: string | null;
  /** URL gambar QR siap tampil (ada di sandbox). */
  qrImage: string | null;
  /** URL halaman QR berdesain (template) milik iPaymu. */
  qrTemplate: string | null;
  subTotal: number | null;
  total: number;
  fee: number;
  feeDirection: string | null;
  escrow: boolean | null;
  /** Waktu kedaluwarsa dari iPaymu (teks asli, WIB tanpa zona). Sandbox terlihat memberi 24 jam; dokumentasi menyebut 5 menit untuk QRIS. */
  expired: string | null;
  /** Seluruh isi `Data` dari respons, untuk diperiksa saat integrasi. */
  raw: Record<string, unknown>;
}

export interface TxInfo {
  trxId: number;
  referenceId: string;
  status: "paid" | "expired" | "pending";
  amount: number;
}

/** "2026-11-07 15:54:19" (WIB, tanpa zona) -> ISO UTC. null bila formatnya tidak dikenal. */
export function parseIpaymuTime(s: string | null): string | null {
  const m = s?.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/);
  if (!m) return null;
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}+07:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Antarmuka yang dipakai route; tes menyuntikkan gateway palsu, produksi memakai IpaymuClient. */
export interface PaymentGateway {
  createCheckout(input: CheckoutInput): Promise<{ sessionId: string; url: string }>;
  /** Opsional: hanya gateway yang mendukung QRIS Direct. Dipakai bila IPAYMU_FLOW=qris. */
  createDirectQris?(input: DirectQrisInput): Promise<DirectQrisResult>;
  /**
   * Opsional: ubah `QrImage` dari iPaymu menjadi sesuatu yang bisa dipakai sebagai <img src>. Di sandbox, URL itu
   * adalah halaman HTML yang membungkus gambar (data URI), bukan file gambar, sehingga <img> langsung gagal tampil.
   */
  resolveQrImage?(url: string): Promise<string>;
  /** null = iPaymu menyatakan transaksi tidak ada. Galat jaringan/auth dilempar sebagai GatewayError. */
  checkTransaction(trxId: number): Promise<TxInfo | null>;
  /** true/false = hasil cek X-Signature callback. */
  verifyCallback(body: Record<string, unknown>, signature: string | undefined, isJson: boolean): boolean;
}

const BASE = { sandbox: "https://sandbox.ipaymu.com/api/v2", live: "https://my.ipaymu.com/api/v2" } as const;

/** signature = HMAC-SHA256(apiKey, "POST:VA:lower(sha256(body)):apiKey"); body yang ditandatangani = body yang dikirim. */
export function signRequest(va: string, apiKey: string, body: string): string {
  const bodyHash = createHash("sha256").update(body).digest("hex").toLowerCase();
  return createHmac("sha256", apiKey).update(`POST:${va}:${bodyHash}:${apiKey}`).digest("hex");
}

/** Timestamp iPaymu: YYYYMMDDhhmmss dalam WIB. */
export function wibTimestamp(now: Date = new Date()): string {
  return new Date(now.getTime() + 7 * 3600_000).toISOString().slice(0, 19).replace(/[-T:]/g, "");
}

const INT_FIELDS = new Set(["trx_id", "status_code", "transaction_status_code", "paid_off"]);

/** Langkah 2-3 dokumen callback iPaymu: normalisasi tipe + additional_info wajib ada. */
export function normalizeCallback(raw: Record<string, unknown>, isJson: boolean): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (k === "signature") continue;
    if (k === "is_escrow") out[k] = v === true || v === "true" || v === "1" || v === 1;
    else if (INT_FIELDS.has(k)) out[k] = typeof v === "number" ? v : parseInt(String(v), 10);
    else if (k === "additional_info") out[k] = v === "[]" ? [] : v;
    else out[k] = isJson ? v : String(v);
  }
  if (!("additional_info" in out)) out.additional_info = [];
  return out;
}

/** HMAC-SHA256 (kunci = VA) atas JSON kunci terurut A-Z dengan "/" di-escape, sesuai dokumentasi callback iPaymu. */
export function callbackSignature(va: string, normalized: Record<string, unknown>): string {
  const sorted = Object.fromEntries(Object.keys(normalized).sort().map((k) => [k, normalized[k]]));
  const json = JSON.stringify(sorted).replace(/\//g, "\\/");
  return createHmac("sha256", va).update(json).digest("hex");
}

export interface IpaymuOptions {
  va: string;
  apiKey: string;
  mode: "sandbox" | "live";
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  /** Log ringkas hasil Check Transaction ke console. Hanya untuk debugging; default mati. */
  debug?: boolean;
  /** Tujuan log debug; tes menyuntikkan penampung. */
  logger?: (...args: unknown[]) => void;
}

export class IpaymuClient implements PaymentGateway {
  private readonly base: string;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly o: IpaymuOptions) {
    this.base = BASE[o.mode];
    this.fetchImpl = o.fetchImpl ?? fetch;
  }

  private async post(path: string, payload: unknown): Promise<{ status: number; json: any }> {
    const body = JSON.stringify(payload);
    let res: Response;
    try {
      res = await this.fetchImpl(this.base + path, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          va: this.o.va,
          signature: signRequest(this.o.va, this.o.apiKey, body),
          timestamp: wibTimestamp(),
        },
        body,
        signal: AbortSignal.timeout(this.o.timeoutMs ?? 15_000),
      });
    } catch (e) {
      throw new GatewayError(`iPaymu tidak terjangkau: ${(e as Error).message}`);
    }
    const json = await res.json().catch(() => ({}));
    return { status: res.status, json };
  }

  async createCheckout(i: CheckoutInput): Promise<{ sessionId: string; url: string }> {
    // Satu baris tagihan senilai total order: diskon voucher sudah termasuk, dan jumlah yang dibayar
    // pasti sama dengan orders.total yang nanti dicocokkan saat verifikasi.
    const { status, json } = await this.post("/payment", {
      product: [`Pesanan ${i.orderId}`],
      qty: [1],
      price: [i.total],
      description: [i.summary.slice(0, 200)],
      returnUrl: i.returnUrl,
      cancelUrl: i.cancelUrl,
      notifyUrl: i.notifyUrl,
      referenceId: i.orderId,
      buyerName: i.buyerName.slice(0, 60),
      buyerEmail: i.buyerEmail,
      buyerPhone: i.buyerPhone,
    });
    const d = json?.Data;
    if (status < 200 || status >= 300 || json?.Success === false || !d?.Url) {
      throw new GatewayError(json?.Message ? `iPaymu: ${json.Message}` : `iPaymu menolak permintaan (HTTP ${status})`);
    }
    return { sessionId: String(d.SessionID ?? d.SessionId ?? ""), url: String(d.Url) };
  }

  /**
   * POST /payment/direct dengan paymentMethod=qris, paymentChannel=mpm (daftar channel di dokumentasi resmi iPaymu).
   * `expired` sengaja tidak dikirim: dokumentasi menyatakan masa berlaku QRIS tetap dan tidak bisa diubah; masa berlaku dibaca dari respons.
   * referenceId = id order, jadi callback dan Check Transaction memakai alur pelunasan yang sama dengan checkout biasa.
   */
  async createDirectQris(i: DirectQrisInput): Promise<DirectQrisResult> {
    const { status, json } = await this.post("/payment/direct", {
      name: i.buyerName.slice(0, 60),
      phone: i.buyerPhone,
      email: i.buyerEmail,
      amount: i.total,
      notifyUrl: i.notifyUrl,
      referenceId: i.orderId,
      paymentMethod: "qris",
      paymentChannel: "mpm",
    });
    const d = json?.Data;
    const trx = Number(d?.TransactionId);
    if (status < 200 || status >= 300 || json?.Success === false || !d || !Number.isFinite(trx)) {
      throw new GatewayError(json?.Message ? `iPaymu: ${json.Message}` : `iPaymu menolak permintaan QRIS (HTTP ${status})`);
    }
    const str = (v: unknown) => (v === undefined || v === null || v === "" ? null : String(v));
    return {
      transactionId: trx,
      referenceId: String(d.ReferenceId ?? i.orderId),
      via: String(d.Via ?? ""),
      channel: String(d.Channel ?? ""),
      paymentNo: str(d.PaymentNo),
      url: str(d.Url),
      qrString: str(d.QrString),
      qrImage: str(d.QrImage),
      qrTemplate: str(d.QrTemplate),
      subTotal: d.SubTotal === undefined || d.SubTotal === null ? null : Number(d.SubTotal),
      total: Number(d.Total ?? i.total),
      fee: Number(d.Fee ?? 0),
      feeDirection: str(d.FeeDirection),
      escrow: typeof d.Escrow === "boolean" ? d.Escrow : null,
      expired: str(d.Expired),
      raw: d as Record<string, unknown>,
    };
  }

  /**
   * Mengambil gambar QR dari URL `QrImage`. Kalau URL itu halaman HTML berisi <img src="data:image/...;base64,...">
   * (perilaku sandbox), gambar di dalamnya dikembalikan sebagai data URI. Selain itu, atau bila gagal, URL asli
   * dikembalikan apa adanya. Hanya host ipaymu.com lewat HTTPS yang diambil.
   */
  async resolveQrImage(url: string): Promise<string> {
    if (url.startsWith("data:image/")) return url;
    try {
      const u = new URL(url);
      if (u.protocol !== "https:" || !(u.hostname === "ipaymu.com" || u.hostname.endsWith(".ipaymu.com"))) return url;
      const res = await this.fetchImpl(url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok || !(res.headers.get("content-type") ?? "").toLowerCase().includes("text/html")) return url;
      const html = (await res.text()).slice(0, 2_000_000);
      const m = /<img[^>]+src=["'](data:image\/(?:png|jpe?g|gif);base64,[A-Za-z0-9+/=]+)["']/i.exec(html);
      return m?.[1] ?? url;
    } catch {
      return url;
    }
  }

  async checkTransaction(trxId: number): Promise<TxInfo | null> {
    const { status, json } = await this.post("/transaction", { transactionId: trxId });
    if (status === 404 || Number(json?.Status) === 404) return null;
    if (status < 200 || status >= 300 || json?.Success === false || !json?.Data) {
      if (json?.Success === false && status >= 400 && status < 500 && status !== 401 && status !== 403) return null;
      throw new GatewayError(json?.Message ? `iPaymu: ${json.Message}` : `Cek transaksi gagal (HTTP ${status})`);
    }
    const d = json.Data;
    if (this.o.debug) {
      (this.o.logger ?? console.log)("[ipaymu:check]", JSON.stringify({
        Status: d.Status, StatusDesc: d.StatusDesc,
        SubTotal: d.SubTotal, Total: d.Total, Amount: d.Amount,
        ReferenceId: d.ReferenceId,
      }));
    }
    const code = Number(d.Status);
    return {
      trxId,
      referenceId: String(d.ReferenceId ?? ""),
      // 1 = berhasil, 6 = pembayaran diterima (settlement menyusul), 7 = dana ditahan escrow (sudah dibayar), -2 = kedaluwarsa
      status: code === 1 || code === 6 || code === 7 ? "paid" : code === -2 ? "expired" : "pending",
      // SubTotal = nilai tagihan sebelum biaya admin; Total bisa memuat fee yang ditanggung pembeli.
      amount: Number(d.SubTotal ?? d.Amount ?? d.Total),
    };
  }

  verifyCallback(body: Record<string, unknown>, signature: string | undefined, isJson: boolean): boolean {
    if (!signature) return false;
    const expected = Buffer.from(callbackSignature(this.o.va, normalizeCallback(body, isJson)));
    const got = Buffer.from(signature);
    return expected.length === got.length && timingSafeEqual(expected, got);
  }
}

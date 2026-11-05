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

export interface TxInfo {
  trxId: number;
  referenceId: string;
  status: "paid" | "expired" | "pending";
  amount: number;
}

/** Antarmuka yang dipakai route; tes menyuntikkan gateway palsu, produksi memakai IpaymuClient. */
export interface PaymentGateway {
  createCheckout(input: CheckoutInput): Promise<{ sessionId: string; url: string }>;
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

  async checkTransaction(trxId: number): Promise<TxInfo | null> {
    const { status, json } = await this.post("/transaction", { transactionId: trxId });
    if (status === 404 || Number(json?.Status) === 404) return null;
    if (status < 200 || status >= 300 || json?.Success === false || !json?.Data) {
      if (json?.Success === false && status >= 400 && status < 500 && status !== 401 && status !== 403) return null;
      throw new GatewayError(json?.Message ? `iPaymu: ${json.Message}` : `Cek transaksi gagal (HTTP ${status})`);
    }
    const d = json.Data;
    const code = Number(d.Status);
    return {
      trxId,
      referenceId: String(d.ReferenceId ?? ""),
      // 1 = berhasil, 6 = pembayaran diterima (settlement menyusul), -2 = kedaluwarsa
      status: code === 1 || code === 6 ? "paid" : code === -2 ? "expired" : "pending",
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

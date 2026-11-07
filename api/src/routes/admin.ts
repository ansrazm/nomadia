import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z, type ZodTypeAny } from "zod";
import type { Db } from "../db/pool.js";
import { ApiError } from "../errors.js";
import { clientIp } from "../services/client-ip.js";
import { LoginLimiter, safeEqual, signToken, verifyToken } from "../services/auth.js";
import type { PaymentGateway } from "../payments/ipaymu.js";
import { MAX_HOME_BANNERS, MAX_IMAGE_BYTES, addHomeBanner, clearDestinationImage, getHomeBannerIds, isImageKind, mediaPath, removeHomeBanner, reorderHomeBanners, setDestinationImage, sniffImage, type ImageType } from "../services/media.js";
import { CHECKOUT_FLOWS, getCheckoutFlow, getEnabledMethods, setCheckoutFlow, setEnabledMethods, type CheckoutFlow } from "../services/settings.js";
import { PAYMENT_METHODS, PAYMENT_METHOD_IDS } from "../payments/methods.js";
import { gatewaySupports } from "../services/payments.js";

/** Baca dan validasi satu berkas gambar dari multipart/form-data (field "file"); jenisnya dari magic bytes. */
async function readImageUpload(c: Context): Promise<{ data: Buffer; type: ImageType }> {
  const form = await c.req.parseBody().catch(() => {
    throw new ApiError(400, "INVALID_FORM", "Kirim berkas sebagai multipart/form-data dengan field \"file\".");
  });
  const file = form["file"];
  if (!(file instanceof File)) throw new ApiError(422, "VALIDATION_FAILED", "Pilih berkas gambar.", { file: ["Pilih berkas gambar."] });
  if (file.size > MAX_IMAGE_BYTES) throw new ApiError(422, "IMAGE_TOO_LARGE", `Gambar terlalu besar (maksimal ${MAX_IMAGE_BYTES / 1024 / 1024} MB).`);
  const data = Buffer.from(await file.arrayBuffer());
  const type = sniffImage(data);
  if (!type) throw new ApiError(422, "INVALID_IMAGE", "Format gambar harus PNG, JPEG, atau WebP.");
  return { data, type };
}

const imageBodyLimit = bodyLimit({
  maxSize: MAX_IMAGE_BYTES + 64 * 1024,
  onError: (c) => c.json({ error: { code: "IMAGE_TOO_LARGE", message: `Gambar terlalu besar (maksimal ${MAX_IMAGE_BYTES / 1024 / 1024} MB).` } }, 413),
});

export interface AdminConfig { email: string; password: string; secret: string }

/** Konteks pembayaran untuk halaman pengaturan: gateway ada/tidaknya dan nilai awal dari env. */
export interface AdminPaymentContext { gateway: PaymentGateway | null; defaultFlow: CheckoutFlow }

const slug = z.string().trim().min(1).max(80).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Hanya huruf kecil, angka, dan tanda hubung");
const text = (max: number) => z.string().trim().min(1).max(max);

const destCreate = z.object({
  slug,
  name: text(80),
  code: z.string().trim().toLowerCase().regex(/^[a-z]{2}$/, "Kode negara 2 huruf"),
  region: text(40),
  network: text(80),
  factor: z.number().min(0.01).max(99.99),
  position: z.number().int().min(0).max(9999).optional(),
});
const destPatch = destCreate.omit({ slug: true }).partial();

const productCreate = z.object({
  id: slug,
  destSlug: slug,
  type: z.enum(["esim", "sim", "wifi"]),
  name: text(120),
  days: z.number().int().min(1).max(365),
  data: text(40),
  price: z.number().int().min(0).max(100_000_000),
  note: z.string().trim().max(200).default(""),
  active: z.boolean().default(true),
  soldOut: z.boolean().default(false),
});
const productPatch = productCreate.omit({ id: true }).partial();

const voucherCode = z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{3,32}$/, "3-32 karakter: huruf, angka, _ atau -");
const voucherCreate = z.object({ code: voucherCode, percent: z.number().int().min(1).max(100), active: z.boolean().default(true) });
const voucherPatch = voucherCreate.omit({ code: true }).partial();

const orderQuery = z.object({
  status: z.enum(["pending", "paid", "expired", "cancelled"]).optional(),
  q: z.string().trim().max(80).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

const pgCode = (e: unknown) => (e as { code?: string })?.code;

async function body<S extends ZodTypeAny>(c: Context, schema: S): Promise<z.infer<S>> {
  const raw = await c.req.json().catch(() => {
    throw new ApiError(400, "INVALID_JSON", "Body harus berupa JSON.");
  });
  const r = schema.safeParse(raw);
  if (!r.success) throw new ApiError(422, "VALIDATION_FAILED", "Data tidak valid.", r.error.flatten().fieldErrors);
  return r.data;
}

/** UPDATE parsial: hanya kolom yang ada di daftar putih yang disentuh. */
function buildUpdate(table: string, key: string, keyVal: string, patch: Record<string, unknown>, cols: Record<string, string>) {
  const sets: string[] = [];
  const params: unknown[] = [keyVal];
  for (const [field, col] of Object.entries(cols)) {
    if (patch[field] !== undefined) { params.push(patch[field]); sets.push(`${col} = $${params.length}`); }
  }
  if (!sets.length) throw new ApiError(422, "VALIDATION_FAILED", "Tidak ada field yang diubah.");
  return { sql: `UPDATE ${table} SET ${sets.join(", ")} WHERE ${key} = $1 RETURNING *`, params };
}

const destDto = (r: any) => ({ slug: r.slug, name: r.name, code: r.code, region: r.region, network: r.network, factor: Number(r.factor), position: r.position, thumbUrl: mediaPath(r.thumb_media), bannerUrl: mediaPath(r.banner_media), ...(r.product_count !== undefined ? { productCount: r.product_count } : {}) });
const productDto = (r: any) => ({ id: r.id, destSlug: r.dest_slug, type: r.type, name: r.name, days: r.days, data: r.data, price: r.price, note: r.note, active: r.active, soldOut: r.sold_out });
const voucherDto = (r: any) => ({ code: r.code, percent: r.percent, active: r.active, ...(r.used !== undefined ? { used: r.used } : {}) });
const orderDto = (r: any) => ({ id: r.id, status: r.status, customerName: r.customer_name, customerEmail: r.customer_email, customerPhone: r.customer_phone, departureDate: r.departure_date, deliveryMethod: r.delivery_method, deliveryDetail: r.delivery_detail, deliveryAddress: r.delivery_address ?? null, subtotal: r.subtotal, discount: r.discount, total: r.total, voucher: r.voucher_code, createdAt: r.created_at, paidAt: r.paid_at });

export function adminRoutes(db: Db, cfg: AdminConfig, pay: AdminPaymentContext = { gateway: null, defaultFlow: "redirect" }, opts: { trustProxyHops?: number } = {}) {
  const app = new Hono();
  const limiter = new LoginLimiter();

  app.post("/admin/login", async (c) => {
    const key = clientIp(c, opts.trustProxyHops ?? 0);
    if (limiter.blocked(key)) throw new ApiError(429, "TOO_MANY_ATTEMPTS", "Terlalu banyak percobaan login. Coba lagi beberapa menit lagi.");
    const { email, password } = await body(c, z.object({ email: z.string().max(200), password: z.string().max(200) }));
    // Dua perbandingan selalu dijalankan agar waktu respons tidak membocorkan mana yang salah.
    const okEmail = safeEqual(email.trim().toLowerCase(), cfg.email.toLowerCase());
    const okPass = safeEqual(password, cfg.password);
    if (!(okEmail && okPass)) {
      limiter.fail(key);
      throw new ApiError(401, "INVALID_CREDENTIALS", "Email atau password salah.");
    }
    limiter.reset(key);
    const { token, expiresAt } = signToken(cfg.secret, cfg.email);
    return c.json({ data: { token, expiresAt: new Date(expiresAt).toISOString(), email: cfg.email } });
  });

  // Semua rute /admin lain wajib membawa Authorization: Bearer <token>.
  app.use("/admin/*", async (c, next) => {
    const h = c.req.header("authorization") ?? "";
    const token = h.startsWith("Bearer ") ? h.slice(7).trim() : "";
    const who = token ? verifyToken(cfg.secret, token) : null;
    if (!who) throw new ApiError(401, "UNAUTHORIZED", "Sesi admin tidak valid atau sudah berakhir. Silakan login lagi.");
    c.set("admin" as never, who.sub as never);
    await next();
  });

  app.get("/admin/me", (c) => c.json({ data: { email: c.get("admin" as never) as string } }));

  app.get("/admin/stats", async (c) => {
    const [orders, rev, cat] = await Promise.all([
      db.query<{ status: string; n: number }>("SELECT status, count(*)::int AS n FROM orders GROUP BY status"),
      db.query<{ revenue: number }>("SELECT COALESCE(sum(total),0)::bigint AS revenue FROM orders WHERE status = 'paid'"),
      db.query<{ destinations: number; products: number; vouchers: number }>(
        "SELECT (SELECT count(*) FROM destinations)::int AS destinations, (SELECT count(*) FROM products WHERE active)::int AS products, (SELECT count(*) FROM vouchers WHERE active)::int AS vouchers",
      ),
    ]);
    const byStatus = { pending: 0, paid: 0, expired: 0, cancelled: 0 } as Record<string, number>;
    for (const r of orders.rows) byStatus[r.status] = r.n;
    return c.json({ data: { orders: byStatus, paidRevenue: Number(rev.rows[0]!.revenue), ...cat.rows[0] } });
  });

  // ---- Pengaturan: alur pembayaran ----
  const settingsView = async () => {
    const { flow, source } = await getCheckoutFlow(db, pay.defaultFlow);
    const enabled = await getEnabledMethods(db, pay.defaultFlow);
    return {
      // Metode bayar: enabled = yang ditawarkan di checkout; available = semua yang dikenal, supported = sanggup dijalankan gateway aktif.
      paymentMethods: {
        enabled: enabled.methods,
        source: enabled.source,
        available: PAYMENT_METHOD_IDS.map((id) => ({ id, label: PAYMENT_METHODS[id].label, group: PAYMENT_METHODS[id].group, supported: !!pay.gateway && gatewaySupports(pay.gateway, id) })),
      },
      checkoutFlow: flow,
      source,
      envDefault: pay.defaultFlow,
      gatewayConfigured: !!pay.gateway,
      qrisSupported: !!pay.gateway?.createDirectQris,
      flows: CHECKOUT_FLOWS,
    };
  };

  app.get("/admin/settings", async (c) => c.json({ data: await settingsView() }));

  // checkoutFlow: "redirect" | "qris" menyimpan alur dasar; null menghapusnya (kembali mengikuti env).
  // paymentMethods: array id metode (tidak kosong) menyimpan pilihan yang ditawarkan di checkout; null menghapusnya (kembali mengikuti alur).
  // Salah satu atau keduanya boleh dikirim; yang tidak dikirim tidak diubah. Berlaku untuk order berikutnya.
  app.patch("/admin/settings", async (c) => {
    const patch = await body(
      c,
      z.object({
        checkoutFlow: z.enum(["redirect", "qris"]).nullable().optional(),
        paymentMethods: z.array(z.enum(PAYMENT_METHOD_IDS)).min(1, "Pilih minimal satu metode bayar").max(PAYMENT_METHOD_IDS.length).nullable().optional(),
      }),
    );
    const { checkoutFlow, paymentMethods } = patch;
    if (checkoutFlow === undefined && paymentMethods === undefined) throw new ApiError(422, "VALIDATION_FAILED", "Tidak ada pengaturan yang diubah.");
    const needsGateway = (checkoutFlow !== undefined && checkoutFlow !== null) || (paymentMethods !== undefined && paymentMethods !== null);
    if (needsGateway && !pay.gateway) throw new ApiError(409, "PAYMENT_NOT_CONFIGURED", "iPaymu belum dikonfigurasi (isi IPAYMU_VA dan IPAYMU_API_KEY di .env, lalu restart API), jadi alur pembayaran belum bisa diubah.");
    if (checkoutFlow === "qris" && !pay.gateway!.createDirectQris) throw new ApiError(409, "FLOW_UNSUPPORTED", "Gateway pembayaran yang aktif tidak mendukung QRIS Direct.");
    if (paymentMethods) {
      const bad = paymentMethods.filter((id) => !gatewaySupports(pay.gateway!, id));
      if (bad.length) throw new ApiError(409, "METHOD_UNSUPPORTED", `Gateway pembayaran yang aktif tidak mendukung: ${bad.map((id) => PAYMENT_METHODS[id].label).join(", ")}.`);
    }
    if (checkoutFlow !== undefined) await setCheckoutFlow(db, checkoutFlow);
    if (paymentMethods !== undefined) await setEnabledMethods(db, paymentMethods);
    return c.json({ data: await settingsView() });
  });

  // ---- Destinasi ----
  app.get("/admin/destinations", async (c) => {
    const r = await db.query(
      `SELECT d.*, (SELECT count(*)::int FROM products p WHERE p.dest_slug = d.slug) AS product_count FROM destinations d ORDER BY d.position, d.name`,
    );
    return c.json({ data: r.rows.map(destDto) });
  });

  app.post("/admin/destinations", async (c) => {
    const d = await body(c, destCreate);
    try {
      const pos = d.position ?? (await db.query<{ n: number }>("SELECT COALESCE(max(position),-1)+1 AS n FROM destinations")).rows[0]!.n;
      const r = await db.query("INSERT INTO destinations (slug,name,code,region,network,factor,position) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *", [d.slug, d.name, d.code, d.region, d.network, d.factor, pos]);
      return c.json({ data: destDto(r.rows[0]) }, 201);
    } catch (e) {
      if (pgCode(e) === "23505") throw new ApiError(409, "SLUG_TAKEN", "Slug destinasi sudah dipakai.");
      throw e;
    }
  });

  app.patch("/admin/destinations/:slug", async (c) => {
    const patch = await body(c, destPatch);
    const u = buildUpdate("destinations", "slug", c.req.param("slug"), patch, { name: "name", code: "code", region: "region", network: "network", factor: "factor", position: "position" });
    const r = await db.query(u.sql, u.params);
    if (!r.rows[0]) throw new ApiError(404, "DESTINATION_NOT_FOUND", "Destinasi tidak ditemukan.");
    return c.json({ data: destDto(r.rows[0]) });
  });

  app.delete("/admin/destinations/:slug", async (c) => {
    try {
      const slug = c.req.param("slug");
      const media = await db.query<{ thumb_media: string | null; banner_media: string | null }>("SELECT thumb_media, banner_media FROM destinations WHERE slug = $1", [slug]);
      const r = await db.query("DELETE FROM destinations WHERE slug = $1", [slug]);
      if (!r.rowCount) throw new ApiError(404, "DESTINATION_NOT_FOUND", "Destinasi tidak ditemukan.");
      // Gambar yang dipakai destinasi ini tidak punya pemilik lagi.
      const ids = [media.rows[0]?.thumb_media, media.rows[0]?.banner_media].filter((x): x is string => !!x);
      if (ids.length) await db.query("DELETE FROM media WHERE id = ANY($1)", [ids]);
      return c.json({ data: { deleted: true } });
    } catch (e) {
      if (pgCode(e) === "23503") throw new ApiError(409, "IN_USE", "Destinasi punya produk yang pernah dipesan, jadi tidak bisa dihapus. Nonaktifkan produknya saja.");
      throw e;
    }
  });

  // Gambar destinasi: kind = thumb (kartu) atau banner (kepala halaman destinasi). Unggahan baru menggantikan yang lama.
  app.post(
    "/admin/destinations/:slug/image/:kind",
    imageBodyLimit,
    async (c) => {
      const kind = c.req.param("kind");
      if (!isImageKind(kind)) throw new ApiError(404, "NOT_FOUND", "Jenis gambar harus thumb atau banner.");
      const { data, type } = await readImageUpload(c);
      const slug = c.req.param("slug");
      if (!(await setDestinationImage(db, slug, kind, data, type))) throw new ApiError(404, "DESTINATION_NOT_FOUND", "Destinasi tidak ditemukan.");
      const r = await db.query("SELECT * FROM destinations WHERE slug = $1", [slug]);
      return c.json({ data: destDto(r.rows[0]) });
    },
  );

  app.delete("/admin/destinations/:slug/image/:kind", async (c) => {
    const kind = c.req.param("kind");
    if (!isImageKind(kind)) throw new ApiError(404, "NOT_FOUND", "Jenis gambar harus thumb atau banner.");
    const slug = c.req.param("slug");
    if (!(await clearDestinationImage(db, slug, kind))) throw new ApiError(404, "DESTINATION_NOT_FOUND", "Destinasi tidak ditemukan.");
    const r = await db.query("SELECT * FROM destinations WHERE slug = $1", [slug]);
    return c.json({ data: destDto(r.rows[0]) });
  });

  // ---- Banner beranda: latar hero di halaman utama, sampai MAX_HOME_BANNERS gambar yang berputar berurutan. ----
  const homeBannersView = async () => ({ max: MAX_HOME_BANNERS, banners: (await getHomeBannerIds(db)).map((id) => ({ id, url: mediaPath(id) })) });

  app.get("/admin/home-banners", async (c) => c.json({ data: await homeBannersView() }));

  app.post("/admin/home-banners", imageBodyLimit, async (c) => {
    const { data, type } = await readImageUpload(c);
    if (!(await addHomeBanner(db, data, type))) throw new ApiError(409, "BANNER_LIMIT", `Maksimal ${MAX_HOME_BANNERS} banner. Hapus salah satu dulu.`);
    return c.json({ data: await homeBannersView() });
  });

  app.put("/admin/home-banners/order", async (c) => {
    const { ids } = await body(c, z.object({ ids: z.array(z.string().max(64)).max(MAX_HOME_BANNERS) }));
    if (!(await reorderHomeBanners(db, ids))) throw new ApiError(409, "BANNER_ORDER_STALE", "Daftar banner sudah berubah. Muat ulang halaman lalu coba lagi.");
    return c.json({ data: await homeBannersView() });
  });

  app.delete("/admin/home-banners/:id", async (c) => {
    if (!(await removeHomeBanner(db, c.req.param("id")))) throw new ApiError(404, "NOT_FOUND", "Banner tidak ditemukan.");
    return c.json({ data: await homeBannersView() });
  });

  // ---- Produk ----
  app.get("/admin/products", async (c) => {
    const dest = c.req.query("dest")?.trim();
    const r = await db.query(
      `SELECT * FROM products ${dest ? "WHERE dest_slug = $1" : ""} ORDER BY dest_slug, CASE type WHEN 'esim' THEN 0 WHEN 'sim' THEN 1 ELSE 2 END, days`,
      dest ? [dest] : [],
    );
    return c.json({ data: r.rows.map(productDto) });
  });

  app.post("/admin/products", async (c) => {
    const p = await body(c, productCreate);
    try {
      const r = await db.query(
        "INSERT INTO products (id,dest_slug,type,name,days,data,price,note,active,sold_out) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *",
        [p.id, p.destSlug, p.type, p.name, p.days, p.data, p.price, p.note, p.active, p.soldOut],
      );
      return c.json({ data: productDto(r.rows[0]) }, 201);
    } catch (e) {
      if (pgCode(e) === "23505") throw new ApiError(409, "ID_TAKEN", "ID produk sudah dipakai.");
      if (pgCode(e) === "23503") throw new ApiError(422, "DESTINATION_NOT_FOUND", "Destinasi tidak ditemukan.");
      throw e;
    }
  });

  app.patch("/admin/products/:id", async (c) => {
    const patch = await body(c, productPatch);
    const u = buildUpdate("products", "id", c.req.param("id"), patch, { destSlug: "dest_slug", type: "type", name: "name", days: "days", data: "data", price: "price", note: "note", active: "active", soldOut: "sold_out" });
    try {
      const r = await db.query(u.sql, u.params);
      if (!r.rows[0]) throw new ApiError(404, "PRODUCT_NOT_FOUND", "Produk tidak ditemukan.");
      return c.json({ data: productDto(r.rows[0]) });
    } catch (e) {
      if (pgCode(e) === "23503") throw new ApiError(422, "DESTINATION_NOT_FOUND", "Destinasi tidak ditemukan.");
      throw e;
    }
  });

  app.delete("/admin/products/:id", async (c) => {
    try {
      const r = await db.query("DELETE FROM products WHERE id = $1", [c.req.param("id")]);
      if (!r.rowCount) throw new ApiError(404, "PRODUCT_NOT_FOUND", "Produk tidak ditemukan.");
      return c.json({ data: { deleted: true } });
    } catch (e) {
      if (pgCode(e) === "23503") throw new ApiError(409, "IN_USE", "Produk ini pernah dipesan, jadi tidak bisa dihapus. Nonaktifkan saja.");
      throw e;
    }
  });

  // ---- Voucher ----
  app.get("/admin/vouchers", async (c) => {
    const r = await db.query("SELECT v.*, (SELECT count(*)::int FROM orders o WHERE o.voucher_code = v.code) AS used FROM vouchers v ORDER BY v.code");
    return c.json({ data: r.rows.map(voucherDto) });
  });

  app.post("/admin/vouchers", async (c) => {
    const v = await body(c, voucherCreate);
    try {
      const r = await db.query("INSERT INTO vouchers (code,percent,active) VALUES ($1,$2,$3) RETURNING *", [v.code, v.percent, v.active]);
      return c.json({ data: voucherDto(r.rows[0]) }, 201);
    } catch (e) {
      if (pgCode(e) === "23505") throw new ApiError(409, "CODE_TAKEN", "Kode voucher sudah ada.");
      throw e;
    }
  });

  app.patch("/admin/vouchers/:code", async (c) => {
    const patch = await body(c, voucherPatch);
    const u = buildUpdate("vouchers", "code", c.req.param("code").toUpperCase(), patch, { percent: "percent", active: "active" });
    const r = await db.query(u.sql, u.params);
    if (!r.rows[0]) throw new ApiError(404, "VOUCHER_NOT_FOUND", "Voucher tidak ditemukan.");
    return c.json({ data: voucherDto(r.rows[0]) });
  });

  app.delete("/admin/vouchers/:code", async (c) => {
    try {
      const r = await db.query("DELETE FROM vouchers WHERE code = $1", [c.req.param("code").toUpperCase()]);
      if (!r.rowCount) throw new ApiError(404, "VOUCHER_NOT_FOUND", "Voucher tidak ditemukan.");
      return c.json({ data: { deleted: true } });
    } catch (e) {
      if (pgCode(e) === "23503") throw new ApiError(409, "IN_USE", "Voucher ini sudah dipakai di order, jadi tidak bisa dihapus. Nonaktifkan saja.");
      throw e;
    }
  });

  // ---- Order ----
  app.get("/admin/orders", async (c) => {
    const parsed = orderQuery.safeParse(c.req.query());
    if (!parsed.success) throw new ApiError(422, "VALIDATION_FAILED", "Parameter tidak valid.", parsed.error.flatten().fieldErrors);
    const { status, q, limit, offset } = parsed.data;
    const params: unknown[] = [];
    const where: string[] = [];
    if (status) { params.push(status); where.push(`status = $${params.length}`); }
    if (q) { params.push(`%${q.replace(/[\\%_]/g, "\\$&")}%`); where.push(`(id ILIKE $${params.length} OR customer_email ILIKE $${params.length} OR customer_name ILIKE $${params.length})`); }
    const w = where.length ? "WHERE " + where.join(" AND ") : "";
    const total = (await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM orders ${w}`, params)).rows[0]!.n;
    const rows = await db.query(`SELECT * FROM orders ${w} ORDER BY created_at DESC, id LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, [...params, limit, offset]);
    return c.json({ data: rows.rows.map(orderDto), total, limit, offset });
  });

  app.get("/admin/orders/:id", async (c) => {
    const o = (await db.query("SELECT * FROM orders WHERE id = $1", [c.req.param("id")])).rows[0];
    if (!o) throw new ApiError(404, "ORDER_NOT_FOUND", "Order tidak ditemukan.");
    const items = await db.query("SELECT product_id, product_name, unit_price, qty FROM order_items WHERE order_id = $1 ORDER BY id", [o.id]);
    return c.json({
      data: {
        ...orderDto(o),
        paymentRef: o.payment_ref,
        paymentUrl: o.payment_url,
        paymentMethod: o.payment_method,
        va: o.payment_va,
        items: items.rows.map((i) => ({ productId: i.product_id, name: i.product_name, unitPrice: i.unit_price, qty: i.qty })),
      },
    });
  });

  // Batalkan order pending. Order paid/expired/cancelled tidak boleh diubah dari sini.
  app.post("/admin/orders/:id/cancel", async (c) => {
    const r = await db.query("UPDATE orders SET status = 'cancelled' WHERE id = $1 AND status = 'pending' RETURNING *", [c.req.param("id")]);
    if (r.rows[0]) return c.json({ data: orderDto(r.rows[0]) });
    const exists = await db.query("SELECT status FROM orders WHERE id = $1", [c.req.param("id")]);
    if (!exists.rows[0]) throw new ApiError(404, "ORDER_NOT_FOUND", "Order tidak ditemukan.");
    throw new ApiError(409, "ORDER_NOT_PENDING", `Hanya order pending yang bisa dibatalkan (status sekarang: ${exists.rows[0]!.status}).`);
  });

  return app;
}

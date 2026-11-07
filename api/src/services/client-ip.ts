import type { Context } from "hono";
import { getConnInfo } from "@hono/node-server/conninfo";

/**
 * Pilih IP klien dari daftar X-Forwarded-For.
 *
 * Tiap proxy tepercaya menambahkan alamat yang dilihatnya di KANAN daftar, sedangkan klien bebas
 * mengisi bagian KIRI. Karena itu IP klien diambil dari kanan: dengan `hops` proxy tepercaya,
 * IP-nya ada di indeks `panjang - hops`. Entri paling kiri tidak pernah dipercaya.
 */
export function pickForwardedIp(header: string | undefined, hops: number): string | null {
  if (!header || hops <= 0) return null;
  const parts = header.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) return null;
  return parts[Math.max(0, parts.length - hops)] ?? null;
}

/** Alamat peer TCP. Null bila tidak ada socket (mis. app.request di tes). */
function socketIp(c: Context): string | null {
  try {
    return getConnInfo(c).remote.address ?? null;
  } catch {
    return null;
  }
}

/**
 * IP klien untuk pembatasan laju. Default: alamat koneksi TCP. Header X-Forwarded-For hanya
 * dipercaya bila `trustProxyHops` > 0 (API ada di belakang proxy yang menimpa/menambah header itu).
 */
export function clientIp(c: Context, trustProxyHops = 0): string {
  return pickForwardedIp(c.req.header("x-forwarded-for"), trustProxyHops) ?? socketIp(c) ?? "unknown";
}

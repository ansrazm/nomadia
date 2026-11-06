// Daftar pesanan yang dibuat dari browser ini dan belum selesai (belum terkonfirmasi lunas).
// Disimpan di localStorage supaya selamat dari perpindahan ke domain iPaymu dan kembali, dan dari
// halaman pesanan yang ditutup sebelum pembayaran terkonfirmasi. Keranjang baru dikurangi setelah
// pesanan terbukti lunas atau pengguna kembali dari iPaymu, bukan saat order dibuat, supaya tombol
// Back dari iPaymu tidak menemukan keranjang kosong.
//
// Berupa daftar, bukan satu id: kalau pengguna membuat pesanan lagi sebelum yang lama lunas,
// pesanan yang lama tetap dikenali dan keranjangnya tetap dibereskan saat lunas.
const KEY = "nomadia-pending-orders";
const OLD_KEY = "nomadia-pending-order"; // format lama: satu id
const MAX = 10;

function write(ids: string[]): void {
  try { localStorage.setItem(KEY, JSON.stringify(ids.slice(-MAX))); } catch { /* storage tidak tersedia */ }
}

export function listPendingOrders(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    const ids = Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
    const old = localStorage.getItem(OLD_KEY);
    if (old) {
      localStorage.removeItem(OLD_KEY);
      if (!ids.includes(old)) ids.push(old);
      write(ids);
    }
    return ids;
  } catch {
    return [];
  }
}

export function markPendingOrder(orderId: string): void {
  const ids = listPendingOrders().filter((id) => id !== orderId);
  ids.push(orderId);
  write(ids);
}

export function forgetPendingOrder(orderId: string): void {
  write(listPendingOrders().filter((id) => id !== orderId));
}

/** true bila orderId tercatat; catatannya langsung dihapus sehingga hanya satu pemanggil yang menang. */
export function consumePendingOrder(orderId: string): boolean {
  const ids = listPendingOrders();
  if (!ids.includes(orderId)) return false;
  write(ids.filter((id) => id !== orderId));
  return true;
}

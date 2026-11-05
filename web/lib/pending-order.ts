// Penanda "pesanan ini sedang dibayar di iPaymu". Disimpan di localStorage supaya selamat dari
// perpindahan ke domain iPaymu dan kembali. Keranjang baru dikosongkan setelah pengguna
// kembali ke /orders/[id], bukan saat order dibuat, supaya tombol Back dari iPaymu tidak
// menemukan keranjang kosong.
const KEY = "nomadia-pending-order";

export function markPendingOrder(orderId: string): void {
  try { localStorage.setItem(KEY, orderId); } catch { /* storage tidak tersedia */ }
}

/** true bila orderId cocok dengan penanda; penanda langsung dihapus. */
export function consumePendingOrder(orderId: string): boolean {
  try {
    if (localStorage.getItem(KEY) !== orderId) return false;
    localStorage.removeItem(KEY);
    return true;
  } catch {
    return false;
  }
}

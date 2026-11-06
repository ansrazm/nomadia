/**
 * Kurangi keranjang dengan baris yang sudah masuk pesanan. Memakai pengurangan qty (bukan kosongkan semua)
 * supaya paket yang ditambahkan SESUDAH checkout tidak ikut terhapus.
 */
export function removeOrdered<T extends { id: string; qty: number }>(cart: T[], ordered: { productId: string; qty: number }[]): T[] {
  const left = new Map<string, number>();
  for (const o of ordered) left.set(o.productId, (left.get(o.productId) ?? 0) + o.qty);
  return cart.flatMap((item) => {
    const n = left.get(item.id) ?? 0;
    return item.qty - n > 0 ? [{ ...item, qty: item.qty - n }] : [];
  });
}

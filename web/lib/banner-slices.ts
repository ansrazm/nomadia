export interface BannerSlice {
  /** Posisi kiri dan lebar kotak irisan, dalam persen lebar hero. */
  left: number;
  width: number;
  /** clip-path polygon dalam persen kotak irisan itu sendiri. */
  clip: string;
}

const r = (v: number) => Math.round(v * 1000) / 1000;

/**
 * Membagi lebar hero menjadi n irisan sama lebar dengan sekat miring (miring `slant` persen lebar hero).
 * Tiap sekat condong ke kanan di atas; kotak irisan sengaja melebar setengah sekat ke tetangganya supaya tidak ada celah,
 * lalu dipotong dengan clip-path. n = 1 menghasilkan satu kotak penuh tanpa potongan.
 */
export function bannerSlices(n: number, slant = 6): BannerSlice[] {
  const half = n > 1 ? slant / 2 : 0;
  return Array.from({ length: n }, (_, i) => {
    const left = i === 0 ? 0 : (i * 100) / n - half;
    const right = i === n - 1 ? 100 : ((i + 1) * 100) / n + half;
    const w = right - left;
    const topLeft = i === 0 ? 0 : (slant / w) * 100;
    const bottomRight = i === n - 1 ? 100 : ((w - slant) / w) * 100;
    return { left: r(left), width: r(w), clip: `polygon(${r(topLeft)}% 0, 100% 0, ${r(bottomRight)}% 100%, 0 100%)` };
  });
}

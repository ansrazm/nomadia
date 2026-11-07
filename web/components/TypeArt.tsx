import { ProductType } from "@/lib/catalog-types";

const INK = "#0C2B45";
const SIGNAL = "#FFC93C";
const WHITE = "#FFFFFF";

/** Warna latar panel ilustrasi per jenis koneksi (palet Nomadia). */
export const typeArtBg: Record<ProductType, string> = {
  esim: "bg-signal",
  sim: "bg-lagoon",
  wifi: "bg-ink",
};

/**
 * Ilustrasi sederhana tiga jenis koneksi, digambar sebagai SVG sendiri (bukan aset pihak lain):
 * ponsel dengan QR untuk eSIM, kartu dengan chip untuk SIM Card, alat dengan sinyal untuk Portable WiFi.
 * `fit="slice"` memotong bagian tepi untuk thumbnail kecil.
 */
export function TypeArt({ type, className = "", fit = "meet" }: { type: ProductType; className?: string; fit?: "meet" | "slice" }) {
  return (
    <svg aria-hidden viewBox="0 0 200 110" preserveAspectRatio={`xMidYMid ${fit}`} className={className}>
      {type === "esim" && (
        <g>
          {/* batang sinyal di kiri */}
          <rect x="18" y="80" width="8" height="14" fill={INK} />
          <rect x="30" y="70" width="8" height="24" fill={INK} />
          <rect x="42" y="60" width="8" height="34" fill={INK} />
          <rect x="54" y="50" width="8" height="44" fill={INK} />
          {/* ponsel */}
          <rect x="76" y="8" width="48" height="96" rx="6" fill={INK} />
          <rect x="82" y="16" width="36" height="80" rx="3" fill={WHITE} />
          {/* QR: tiga penanda sudut dan beberapa titik */}
          <rect x="88" y="28" width="9" height="9" fill={INK} />
          <rect x="90" y="30" width="5" height="5" fill={WHITE} />
          <rect x="91" y="31" width="3" height="3" fill={INK} />
          <rect x="103" y="28" width="9" height="9" fill={INK} />
          <rect x="105" y="30" width="5" height="5" fill={WHITE} />
          <rect x="106" y="31" width="3" height="3" fill={INK} />
          <rect x="88" y="43" width="9" height="9" fill={INK} />
          <rect x="90" y="45" width="5" height="5" fill={WHITE} />
          <rect x="91" y="46" width="3" height="3" fill={INK} />
          <rect x="103" y="43" width="4" height="4" fill={INK} />
          <rect x="109" y="47" width="3" height="5" fill={INK} />
          <rect x="88" y="58" width="24" height="4" fill={INK} />
          <rect x="88" y="66" width="14" height="4" fill={INK} />
          <rect x="106" y="66" width="6" height="4" fill={INK} />
          {/* tanda centang di kanan */}
          <rect x="140" y="30" width="30" height="30" rx="4" fill={INK} />
          <path d="m148 45 5 5 9-10" fill="none" stroke={SIGNAL} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      )}
      {type === "sim" && (
        <g transform="rotate(-8 100 55)">
          {/* kartu dengan sudut atas kanan terpotong */}
          <path d="M58 24h64l22 22v38a6 6 0 0 1-6 6H58a6 6 0 0 1-6-6V30a6 6 0 0 1 6-6z" fill={WHITE} />
          <rect x="66" y="42" width="28" height="22" rx="3" fill={SIGNAL} />
          <path d="M66 53h28M80 42v22" fill="none" stroke={INK} strokeWidth="1.5" />
          <rect x="104" y="58" width="30" height="5" fill={INK} opacity="0.2" />
          <rect x="104" y="68" width="20" height="5" fill={INK} opacity="0.2" />
        </g>
      )}
      {type === "wifi" && (
        <g>
          {/* gelombang sinyal di kedua sisi */}
          <path d="M140 46a16 16 0 0 1 0 24" fill="none" stroke={SIGNAL} strokeWidth="3" strokeLinecap="round" />
          <path d="M148 40a24 24 0 0 1 0 36" fill="none" stroke={SIGNAL} strokeWidth="3" strokeLinecap="round" />
          <path d="M60 46a16 16 0 0 0 0 24" fill="none" stroke={SIGNAL} strokeWidth="3" strokeLinecap="round" />
          <path d="M52 40a24 24 0 0 0 0 36" fill="none" stroke={SIGNAL} strokeWidth="3" strokeLinecap="round" />
          {/* alat */}
          <rect x="70" y="14" width="60" height="82" rx="6" fill={WHITE} fillOpacity="0.1" stroke={WHITE} strokeOpacity="0.6" strokeWidth="2" />
          <rect x="78" y="22" width="44" height="30" rx="3" fill={INK} stroke={WHITE} strokeOpacity="0.3" />
          <rect x="88" y="40" width="5" height="6" fill={SIGNAL} />
          <rect x="97" y="36" width="5" height="10" fill={SIGNAL} />
          <rect x="106" y="32" width="5" height="14" fill={SIGNAL} />
          <rect x="115" y="28" width="5" height="18" fill={SIGNAL} />
          <circle cx="100" cy="76" r="7" fill={SIGNAL} />
        </g>
      )}
    </svg>
  );
}

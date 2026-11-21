import fixture from "../data/fixture.json";
import type { Faq, Guide } from "./types";

const BASE = (import.meta.env.STRAPI_URL ?? "").replace(/\/+$/, "");
const TOKEN = import.meta.env.STRAPI_TOKEN as string | undefined;

// Respons REST Strapi 5: objek datar (tanpa pembungkus "attributes"), hanya entri yang sudah dipublikasikan.
interface Page<T> { data: T[]; meta: { pagination: { total: number } } }

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}/api${path}`, {
    headers: TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {},
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Strapi ${path} -> HTTP ${res.status}`);
  return (await res.json()) as T;
}

let cache: Promise<{ guides: Guide[]; faqs: Faq[] }> | undefined;

/** Satu kali ambil per build, dipakai semua halaman. */
export function getContent() {
  cache ??= load();
  return cache;
}

async function load() {
  if (!BASE) {
    console.warn("[content] STRAPI_URL kosong: memakai src/data/fixture.json (hanya untuk development/CI).");
    return fixture as unknown as { guides: Guide[]; faqs: Faq[] };
  }
  const [g, f] = await Promise.all([
    get<Page<Guide>>("/guides?sort=position:asc&pagination[pageSize]=100"),
    get<Page<Faq>>("/faqs?sort=position:asc&pagination[pageSize]=100"),
  ]);
  // Gagal cepat: lebih baik build berhenti (situs lama tetap tayang) daripada men-deploy situs kosong.
  if (g.data.length === 0) throw new Error("Strapi mengembalikan 0 panduan: cek seed dan izin publik (find).");
  return { guides: g.data, faqs: f.data };
}

export async function getGuides() { return (await getContent()).guides; }
export async function getFaqs() { return (await getContent()).faqs; }
export async function getGuide(slug: string) { return (await getGuides()).find((g) => g.slug === slug) ?? null; }

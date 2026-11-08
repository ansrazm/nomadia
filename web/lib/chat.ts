import { ApiRequestError } from "./api";
import type { ProductType } from "./catalog-types";

const API_URL = process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, "") ?? "";

/** Kartu paket dari POST /chat. Seluruh isinya dibaca server dari database, bukan ditulis model. */
export interface ChatCard {
  productId: string;
  destSlug: string;
  destName: string;
  type: ProductType;
  name: string;
  days: number;
  data: string;
  price: number;
}

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface ChatReply {
  reply: string;
  cards: ChatCard[];
}

/** Server hanya memakai giliran terakhir (MAX_HISTORY di api/src/routes/chat.ts); klien tidak perlu mengirim lebih. */
export const CHAT_HISTORY = 12;
/** Sama dengan MAX_MESSAGE_CHARS di server. */
export const CHAT_MAX_CHARS = 600;

/**
 * GET {API_URL}/chat/status. true hanya bila server menjawab enabled; API belum diatur, mati, atau chat dinonaktifkan
 * semuanya menghasilkan false sehingga web memakai FAQ statis.
 */
export async function getChatEnabled(signal?: AbortSignal): Promise<boolean> {
  if (!API_URL) return false;
  try {
    const res = await fetch(`${API_URL}/chat/status`, { cache: "no-store", ...(signal ? { signal } : {}) });
    if (!res.ok) return false;
    return (await res.json())?.data?.enabled === true;
  } catch {
    return false;
  }
}

/** POST {API_URL}/chat. 429 = server sibuk (details.retryAfterSec), 502 = model tidak bisa dihubungi, 503 = chat dinonaktifkan. */
export async function sendChat(turns: ChatTurn[], signal?: AbortSignal): Promise<ChatReply> {
  if (!API_URL) throw new ApiRequestError(0, "NO_API", "NEXT_PUBLIC_API_URL belum diisi.");
  const res = await fetch(`${API_URL}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify({ messages: turns.slice(-CHAT_HISTORY) }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const e = json?.error;
    throw new ApiRequestError(res.status, e?.code ?? "UNKNOWN", e?.message ?? "Permintaan gagal.", e?.details);
  }
  const d = json?.data;
  return { reply: typeof d?.reply === "string" ? d.reply : "", cards: Array.isArray(d?.cards) ? (d.cards as ChatCard[]) : [] };
}

import { Hono } from "hono";
import { z } from "zod";
import type { Db } from "../db/pool.js";
import { ApiError } from "../errors.js";
import { LlmError, type LlmClient } from "../chat/llm.js";
import { runChat } from "../chat/agent.js";
import { RateLimiter } from "../services/rate-limit.js";

export interface ChatDeps {
  llm: LlmClient;
  /** Batas total panggilan chat per jam untuk seluruh server, supaya tagihan model tidak bisa dilonjakkan. */
  globalPerHour?: number;
}

export const MAX_MESSAGE_CHARS = 600;
/** Hanya giliran terakhir yang dikirim ke model: biaya per pesan tetap terbatas. */
export const MAX_HISTORY = 12;

const body = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().trim().min(1, "Pesan kosong").max(MAX_MESSAGE_CHARS, `Pesan maksimal ${MAX_MESSAGE_CHARS} karakter`) }))
    .min(1)
    .max(40),
});

export function chatRoutes(db: Db, chat: ChatDeps | null) {
  const app = new Hono();
  const global = chat ? new RateLimiter(chat.globalPerHour ?? 300, 3_600_000) : null;

  // Web memakai ini untuk memilih antara panel chat dan FAQ statis.
  app.get("/chat/status", (c) => c.json({ data: { enabled: !!chat } }));

  app.post("/chat", async (c) => {
    if (!chat || !global) {
      return c.json({ error: { code: "CHAT_DISABLED", message: "Asisten chat belum diaktifkan di server ini. Isi LLM_API_KEY di .env, lalu jalankan ulang API." } }, 503);
    }
    const raw = await c.req.json().catch(() => {
      throw new ApiError(400, "INVALID_JSON", "Body harus berupa JSON.");
    });
    const parsed = body.safeParse(raw);
    if (!parsed.success) throw new ApiError(422, "VALIDATION_FAILED", "Pesan tidak valid.", parsed.error.flatten());
    let history = parsed.data.messages.slice(-MAX_HISTORY);
    // Giliran harus diawali pengguna dan diakhiri pengguna.
    while (history.length && history[0]!.role !== "user") history = history.slice(1);
    if (history.length === 0 || history[history.length - 1]!.role !== "user") {
      throw new ApiError(422, "VALIDATION_FAILED", "Pesan terakhir harus dari pengguna.");
    }

    const slot = global.hit("all");
    if (!slot.ok) {
      c.header("Retry-After", String(slot.retryAfterSec));
      return c.json({ error: { code: "CHAT_BUSY", message: "Asisten sedang ramai. Coba lagi sebentar lagi.", details: { retryAfterSec: slot.retryAfterSec } } }, 429);
    }

    try {
      const r = await runChat({ llm: chat.llm, db, history });
      return c.json({ data: { reply: r.reply, cards: r.cards } });
    } catch (e) {
      // Isi percakapan sengaja tidak dilog (mungkin memuat email pembeli). Pesan galat penyedia hanya ke log server.
      console.error(`[chat] model ${chat.llm.name} gagal:`, e instanceof LlmError ? e.message : e instanceof Error ? e.message : e);
      throw new ApiError(502, "CHAT_UNAVAILABLE", "Asisten sedang tidak bisa dihubungi. Coba lagi sebentar lagi.");
    }
  });

  return app;
}

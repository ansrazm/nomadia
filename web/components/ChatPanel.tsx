"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiRequestError } from "@/lib/api";
import { CHAT_MAX_CHARS, getChatEnabled, sendChat, type ChatCard, type ChatTurn } from "@/lib/chat";
import { typeInfo } from "@/lib/catalog-types";
import { idr } from "@/lib/format";
import type { MessageKey } from "@/lib/i18n/messages";
import { useCart } from "./CartProvider";
import { useLang } from "./LanguageProvider";

export interface ChatMessage extends ChatTurn {
  id: number;
  cards?: ChatCard[];
}

/** null = belum dicek; false = pakai FAQ statis. */
export type ChatStatus = boolean | null;

export interface ChatSession {
  status: ChatStatus;
  messages: ChatMessage[];
  busy: boolean;
  error: MessageKey | null;
  /** Dipanggil saat panel dibuka: cek status sekali saja. */
  ensureStatus: () => void;
  send: (text: string) => void;
  retry: () => void;
}

/**
 * Percakapan disimpan di luar panel supaya tidak hilang saat panel ditutup dan dibuka lagi (panel dilepas dari DOM saat tertutup).
 * Tidak disimpan ke storage: percakapan hilang saat halaman dimuat ulang.
 */
export function useChatSession(): ChatSession {
  const [status, setStatus] = useState<ChatStatus>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<MessageKey | null>(null);
  const checked = useRef(false);
  const nextId = useRef(1);
  const abort = useRef<AbortController | null>(null);
  const turns = useRef<ChatTurn[]>([]);

  useEffect(() => () => abort.current?.abort(), []);

  const ensureStatus = useCallback(() => {
    if (checked.current) return;
    checked.current = true;
    void getChatEnabled().then(setStatus);
  }, []);

  const run = useCallback(async (history: ChatTurn[]) => {
    const ctl = new AbortController();
    abort.current = ctl;
    setBusy(true);
    setError(null);
    try {
      const r = await sendChat(history, ctl.signal);
      if (ctl.signal.aborted) return;
      const reply = r.reply.trim();
      turns.current = [...history, { role: "assistant", content: reply }];
      setMessages((m) => [...m, { id: nextId.current++, role: "assistant", content: reply, cards: r.cards }]);
    } catch (e) {
      if (ctl.signal.aborted) return;
      if (e instanceof ApiRequestError && e.code === "CHAT_DISABLED") {
        setStatus(false); // dimatikan di server setelah panel dibuka: kembali ke FAQ
      } else {
        setError(e instanceof ApiRequestError && e.status === 429 ? "chat.errBusy" : e instanceof ApiRequestError && e.status === 422 ? "chat.errInvalid" : "chat.errDown");
      }
    } finally {
      if (abort.current === ctl) setBusy(false);
    }
  }, []);

  const send = useCallback(
    (text: string) => {
      const content = text.trim().slice(0, CHAT_MAX_CHARS);
      if (!content || busy) return;
      turns.current = [...turns.current, { role: "user", content }];
      setMessages((m) => [...m, { id: nextId.current++, role: "user", content }]);
      void run(turns.current);
    },
    [busy, run],
  );

  const retry = useCallback(() => {
    if (busy || turns.current.length === 0) return;
    void run(turns.current);
  }, [busy, run]);

  return { status, messages, busy, error, ensureStatus, send, retry };
}

/** Model kecil kadang memakai markdown tebal; tampilkan sebagai teks biasa. Teks tidak pernah dirender sebagai HTML. */
const plain = (s: string) => s.replace(/\*\*(.+?)\*\*/g, "$1");

function PackageCard({ card }: { card: ChatCard }) {
  const { t } = useLang();
  const { add } = useCart();
  const [added, setAdded] = useState(false);
  return (
    <li className="rounded-[4px] border border-line bg-white p-3 text-ink">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-deep">
        {card.destName} · {typeInfo[card.type].label}
      </p>
      <p className="mt-0.5 text-sm font-bold">{card.name}</p>
      <p className="text-xs text-ink/70">{t("chat.cardMeta", { days: card.days, data: card.data })}</p>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-sm font-bold">{idr(card.price)}</span>
        <span className="flex items-center gap-2">
          <Link href={`/destinations/${card.destSlug}`} className="text-xs font-semibold text-deep underline underline-offset-2">
            {t("chat.view")}
          </Link>
          <button
            type="button"
            onClick={() => {
              add({ id: card.productId, destSlug: card.destSlug, type: card.type, name: card.name, days: card.days, data: card.data, price: card.price, note: "" });
              setAdded(true);
            }}
            className="rounded-[4px] bg-signal px-3 py-1.5 text-xs font-bold text-ink transition-colors hover:bg-[#ffd86b]"
          >
            {added ? t("chat.added") : t("chat.add")}
          </button>
        </span>
      </div>
    </li>
  );
}

export function ChatPanel({ session }: { session: ChatSession }) {
  const { t } = useLang();
  const { messages, busy, error, send, retry } = session;
  const [text, setText] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // scrollTop dipakai (bukan scrollTo) supaya jalan di semua browser dan jsdom.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, busy, error]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <div className="flex h-[min(26rem,calc(100dvh-13rem))] flex-col">
      <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto bg-mist px-4 py-4" role="log" aria-live="polite" aria-label={t("chat.listAria")}>
        <p className="max-w-[85%] rounded-[4px] bg-white px-3 py-2 text-sm leading-relaxed text-ink shadow-sm">{t("chat.intro")}</p>
        {messages.map((m) =>
          m.role === "user" ? (
            <p key={m.id} className="ml-auto max-w-[85%] whitespace-pre-wrap break-words rounded-[4px] bg-ink px-3 py-2 text-sm leading-relaxed text-white">
              {m.content}
            </p>
          ) : (
            <div key={m.id} className="max-w-[92%] space-y-2">
              {m.content && <p className="whitespace-pre-wrap break-words rounded-[4px] bg-white px-3 py-2 text-sm leading-relaxed text-ink shadow-sm">{plain(m.content)}</p>}
              {m.cards && m.cards.length > 0 && (
                <ul className="space-y-2">
                  {m.cards.map((c) => (
                    <PackageCard key={c.productId} card={c} />
                  ))}
                </ul>
              )}
            </div>
          ),
        )}
        {busy && <p className="text-xs text-ink/60">{t("chat.thinking")}</p>}
        {error && (
          <p role="alert" className="rounded-[4px] border border-coral/40 bg-white px-3 py-2 text-xs text-ink">
            {t(error)}{" "}
            <button type="button" onClick={retry} disabled={busy} className="font-bold text-deep underline underline-offset-2">
              {t("chat.retry")}
            </button>
          </p>
        )}
      </div>
      <form
        className="border-t border-line bg-white p-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!text.trim() || busy) return;
          send(text);
          setText("");
        }}
      >
        <div className="flex gap-2">
          <input
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={CHAT_MAX_CHARS}
            placeholder={t("chat.placeholder")}
            aria-label={t("chat.inputAria")}
            className="min-w-0 flex-1 rounded-[4px] border border-line px-3 py-2 text-sm text-ink outline-none focus:border-lagoon"
          />
          <button type="submit" disabled={busy || !text.trim()} className="rounded-[4px] bg-ink px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-deep disabled:opacity-50">
            {t("chat.send")}
          </button>
        </div>
        <p className="mt-1.5 text-[11px] text-ink/50">{t("chat.aiNote")}</p>
      </form>
    </div>
  );
}

"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useState } from "react";
import { removeOrdered } from "@/lib/settle";
import type { Product } from "@/lib/catalog-types";

export interface CartItem {
  id: string;
  name: string;
  type: Product["type"];
  destSlug: string;
  price: number;
  qty: number;
}

type Action =
  | { t: "hydrate"; items: CartItem[] }
  | { t: "add"; item: Omit<CartItem, "qty"> }
  | { t: "qty"; id: string; qty: number }
  | { t: "remove"; id: string }
  | { t: "settle"; ordered: { productId: string; qty: number }[] }
  | { t: "clear" };

function reducer(state: CartItem[], a: Action): CartItem[] {
  switch (a.t) {
    case "hydrate":
      return a.items;
    case "add": {
      const found = state.find((i) => i.id === a.item.id);
      if (found) return state.map((i) => (i.id === a.item.id ? { ...i, qty: Math.min(i.qty + 1, 9) } : i));
      return [...state, { ...a.item, qty: 1 }];
    }
    case "qty":
      return a.qty <= 0 ? state.filter((i) => i.id !== a.id) : state.map((i) => (i.id === a.id ? { ...i, qty: Math.min(a.qty, 9) } : i));
    case "remove":
      return state.filter((i) => i.id !== a.id);
    case "settle":
      return removeOrdered(state, a.ordered);
    case "clear":
      return [];
  }
}

interface CartCtx {
  items: CartItem[];
  count: number;
  /** true setelah keranjang dibaca dari localStorage. */
  ready: boolean;
  add: (p: Product) => void;
  setQty: (id: string, qty: number) => void;
  remove: (id: string) => void;
  /** Kurangi keranjang dengan baris pesanan yang sudah dibuat/lunas. */
  settle: (ordered: { productId: string; qty: number }[]) => void;
  clear: () => void;
  /** Paket yang baru saja ditambahkan, dipakai untuk toast. */
  lastAdded: { name: string; at: number } | null;
  dismissAdded: () => void;
}

const Ctx = createContext<CartCtx | null>(null);
const KEY = "nomadia-cart";

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, dispatch] = useReducer(reducer, []);
  const [ready, setReady] = useState(false);
  const [lastAdded, setLastAdded] = useState<{ name: string; at: number } | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) dispatch({ t: "hydrate", items: JSON.parse(raw) as CartItem[] });
    } catch {
      /* storage tidak tersedia: lanjut dengan keranjang kosong */
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(items));
    } catch {
      /* abaikan */
    }
  }, [items, ready]);

  const add = useCallback((p: Product) => {
    dispatch({ t: "add", item: { id: p.id, name: p.name, type: p.type, destSlug: p.destSlug, price: p.price } });
    setLastAdded({ name: p.name, at: Date.now() });
  }, []);
  const dismissAdded = useCallback(() => setLastAdded(null), []);
  const settle = useCallback((ordered: { productId: string; qty: number }[]) => dispatch({ t: "settle", ordered }), []);
  const value = useMemo<CartCtx>(
    () => ({
      items,
      count: items.reduce((n, i) => n + i.qty, 0),
      ready,
      add,
      setQty: (id, qty) => dispatch({ t: "qty", id, qty }),
      remove: (id) => dispatch({ t: "remove", id }),
      settle,
      clear: () => dispatch({ t: "clear" }),
      lastAdded,
      dismissAdded,
    }),
    [items, ready, add, settle, lastAdded, dismissAdded],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCart() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useCart harus dipakai di dalam CartProvider");
  return ctx;
}

"use client";

import { useEffect, useState, type RefObject } from "react";

function observe(el: Element | null, set: (v: boolean) => void): () => void {
  if (!el || typeof IntersectionObserver === "undefined") return () => {};
  const io = new IntersectionObserver(([e]) => set(e.isIntersecting));
  io.observe(el);
  return () => io.disconnect();
}

/** true selagi elemen (lewat ref) terlihat di layar. Dipakai untuk menyembunyikan bar melayang saat isinya sudah terlihat di halaman. */
export function useOnScreen(ref: RefObject<Element | null>): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => observe(ref.current, setOn), [ref]);
  return on;
}

/** true selagi footer situs terlihat, supaya bar melayang tidak menutupi tautan footer. */
export function useFooterOnScreen(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => observe(document.querySelector("footer"), setOn), []);
  return on;
}

import { Marked } from "marked";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// HTML mentah di konten tidak diteruskan: ditampilkan sebagai teks. Konten datang dari editor tepercaya,
// tetapi situs publik tidak perlu mempercayai isi CMS sepenuhnya.
const md = new Marked({
  renderer: {
    html: ({ text }) => esc(text),
    link({ href, title, tokens }) {
      const safe = /^(https?:|mailto:|\/|#)/i.test(href) ? href : "#";
      const t = title ? ` title="${esc(title)}"` : "";
      return `<a href="${esc(safe)}"${t}>${this.parser.parseInline(tokens)}</a>`;
    },
  },
});

export const renderMarkdown = (src: string): string => md.parse(src, { async: false }) as string;

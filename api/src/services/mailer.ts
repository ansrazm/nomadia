import nodemailer from "nodemailer";

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/** Pengirim email dipisah dari logika login supaya tes memakai pengirim palsu dan produksi memakai SMTP. */
export interface Mailer {
  send(msg: MailMessage): Promise<void>;
}

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
  from: string;
}

export class SmtpMailer implements Mailer {
  private transport;
  constructor(private cfg: SmtpConfig) {
    this.transport = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      ...(cfg.user && cfg.pass ? { auth: { user: cfg.user, pass: cfg.pass } } : {}),
      // Jangan menggantung bila SMTP tidak terjangkau: pelanggan harus segera dapat pesan galat.
      connectionTimeout: 8000,
      greetingTimeout: 8000,
      socketTimeout: 12000,
    });
  }
  async send(msg: MailMessage): Promise<void> {
    await this.transport.sendMail({ from: this.cfg.from, to: msg.to, subject: msg.subject, text: msg.text, html: msg.html });
  }
}

export type MailLang = "id" | "en";

const wrap = (hello: string, body: string, small: string) =>
  `<div style="font-family:Arial,sans-serif;max-width:420px;margin:0 auto;color:#0b2a45">\n<p>${hello}</p>${body}\n<p style="color:#4a6070;font-size:14px">${small}</p><p style="color:#4a6070;font-size:14px">Nomadia</p></div>`;
const codeBox = (code: string) =>
  `<p style="font-size:32px;font-weight:700;letter-spacing:8px;background:#fff6d6;border-radius:6px;padding:14px 18px;display:inline-block;margin:4px 0">${code}</p>`;

/** Email kode (masuk atau verifikasi pendaftaran). Kodenya hanya berisi digit, jadi aman dimasukkan ke HTML tanpa escape. */
export function codeEmail(lang: MailLang, kind: "login" | "register", code: string, minutes: number): { subject: string; text: string; html: string } {
  const en = lang === "en";
  const t = {
    subject: kind === "login" ? (en ? `Your Nomadia sign-in code: ${code}` : `Kode masuk Nomadia: ${code}`) : en ? `Verify your Nomadia account: ${code}` : `Verifikasi akun Nomadia: ${code}`,
    hello: en ? "Hi," : "Halo,",
    intro:
      kind === "login"
        ? en ? "Use this code to sign in to Nomadia:" : "Gunakan kode ini untuk masuk ke Nomadia:"
        : en ? "Use this code to verify your email and finish creating your Nomadia account:" : "Gunakan kode ini untuk memverifikasi email dan menyelesaikan pendaftaran akun Nomadia:",
    valid: en ? `The code is valid for ${minutes} minutes and can only be used once.` : `Kode berlaku ${minutes} menit dan hanya bisa dipakai sekali.`,
    ignore: en ? "If you didn't request this, you can ignore this email. Your account stays safe." : "Kalau kamu tidak memintanya, abaikan saja email ini. Akunmu tetap aman.",
  };
  const text = `${t.hello}\n\n${t.intro}\n\n${code}\n\n${t.valid}\n${t.ignore}\n\nNomadia`;
  return { subject: t.subject, text, html: wrap(t.hello, `<p>${t.intro}</p>\n${codeBox(code)}`, `${t.valid}<br>${t.ignore}`) };
}

export const loginCodeEmail = (lang: MailLang, code: string, minutes: number) => codeEmail(lang, "login", code, minutes);

/** Dikirim ke email yang sudah punya akun berkata sandi saat ada yang mencoba mendaftar dengannya. Tanpa kode apa pun. */
export function accountExistsEmail(lang: MailLang): { subject: string; text: string; html: string } {
  const en = lang === "en";
  const hello = en ? "Hi," : "Halo,";
  const body = en
    ? "Someone tried to create a Nomadia account with this email, but an account already exists. Just sign in with your password, or use the code option on the sign-in page."
    : "Ada yang mencoba mendaftar akun Nomadia dengan email ini, tetapi akunnya sudah ada. Masuk saja dengan kata sandimu, atau pakai pilihan kode di halaman masuk.";
  const ignore = en ? "If this wasn't you, no action is needed." : "Kalau itu bukan kamu, tidak perlu melakukan apa pun.";
  return {
    subject: en ? "You already have a Nomadia account" : "Kamu sudah punya akun Nomadia",
    text: `${hello}\n\n${body}\n${ignore}\n\nNomadia`,
    html: wrap(hello, `<p>${body}</p>`, ignore),
  };
}

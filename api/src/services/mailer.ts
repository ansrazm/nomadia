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

/** Email kode masuk. Kodenya hanya berisi digit, jadi aman dimasukkan ke HTML tanpa escape. */
export function loginCodeEmail(lang: MailLang, code: string, minutes: number): { subject: string; text: string; html: string } {
  const t =
    lang === "en"
      ? {
          subject: `Your Nomadia sign-in code: ${code}`,
          hello: "Hi,",
          intro: "Use this code to sign in to Nomadia:",
          valid: `The code is valid for ${minutes} minutes and can only be used once.`,
          ignore: "If you didn't request this, you can ignore this email. Your account stays safe.",
        }
      : {
          subject: `Kode masuk Nomadia: ${code}`,
          hello: "Halo,",
          intro: "Gunakan kode ini untuk masuk ke Nomadia:",
          valid: `Kode berlaku ${minutes} menit dan hanya bisa dipakai sekali.`,
          ignore: "Kalau kamu tidak memintanya, abaikan saja email ini. Akunmu tetap aman.",
        };
  const text = `${t.hello}\n\n${t.intro}\n\n${code}\n\n${t.valid}\n${t.ignore}\n\nNomadia`;
  const html = `<div style="font-family:Arial,sans-serif;max-width:420px;margin:0 auto;color:#0b2a45">
<p>${t.hello}</p><p>${t.intro}</p>
<p style="font-size:32px;font-weight:700;letter-spacing:8px;background:#fff6d6;border-radius:6px;padding:14px 18px;display:inline-block;margin:4px 0">${code}</p>
<p style="color:#4a6070;font-size:14px">${t.valid}<br>${t.ignore}</p><p style="color:#4a6070;font-size:14px">Nomadia</p></div>`;
  return { subject: t.subject, text, html };
}

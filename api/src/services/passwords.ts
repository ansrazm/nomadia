import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, keylen: number, opts: { N: number; r: number; p: number; maxmem: number }) => Promise<Buffer>;

// scrypt bawaan Node, tanpa dependensi tambahan. N=2^15, r=8 memakai sekitar 32 MiB dan ±100 md per hash.
const N = 2 ** 15;
const R = 8;
const P = 1;
const KEYLEN = 64;
const MAXMEM = 128 * 1024 * 1024;

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;

/** Format tersimpan: scrypt$N$r$p$salt$hash (base64). Parameter ikut disimpan supaya bisa dinaikkan nanti tanpa merusak hash lama. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, KEYLEN, { N, r: R, p: P, maxmem: MAXMEM });
  return ["scrypt", N, R, P, salt.toString("base64"), key.toString("base64")].join("$");
}

/** False untuk kata sandi salah maupun hash yang rusak (tidak pernah melempar). Perbandingannya waktu-konstan. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [alg, n, r, p, salt, hash] = stored.split("$");
  if (alg !== "scrypt" || !n || !r || !p || !salt || !hash) return false;
  const params = { N: Number(n), r: Number(r), p: Number(p), maxmem: MAXMEM };
  if (![params.N, params.r, params.p].every((x) => Number.isInteger(x) && x > 0) || params.N > 2 ** 17) return false;
  try {
    const expected = Buffer.from(hash, "base64");
    const key = await scrypt(password, Buffer.from(salt, "base64"), expected.length, params);
    return key.length === expected.length && timingSafeEqual(key, expected);
  } catch {
    return false;
  }
}

let dummy: Promise<string> | null = null;
/** Hash palsu untuk email tanpa akun: pemeriksaan tetap memakan waktu yang sama, jadi lamanya respons tidak membocorkan akun. */
export const dummyHash = () => (dummy ??= hashPassword("tidak-dipakai-siapa-pun"));

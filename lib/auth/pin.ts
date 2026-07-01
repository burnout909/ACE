import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";

const WINDOW_MS = 10 * 60_000;
const MAX_ATTEMPTS = 5;

export function hashPin(pin: string, salt: string): string {
  return bytesToHex(hmac(sha256, utf8ToBytes(salt), utf8ToBytes(pin)));
}

export function verifyPin(pin: string, salt: string, hash: string): boolean {
  return hashPin(pin, salt) === hash;
}

export function isLockedOut(attempts: { at: number }[], now: number): boolean {
  const recent = attempts.filter((a) => now - a.at < WINDOW_MS);
  return recent.length >= MAX_ATTEMPTS;
}

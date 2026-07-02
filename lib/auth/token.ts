import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";
import { timingSafeEqual } from "crypto";

function mac(payload: string, secret: string): string {
  return bytesToHex(hmac(sha256, utf8ToBytes(secret), utf8ToBytes(payload)));
}

// Constant-time string compare to avoid leaking signature bytes via timing.
export function safeEqual(a: string, b: string): boolean {
  const ba = utf8ToBytes(a);
  const bb = utf8ToBytes(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export function signToken(raterId: string, period: 1 | 2, secret: string): string {
  const payload = Buffer.from(JSON.stringify({ raterId, period }), "utf8").toString("base64url");
  return `${payload}.${mac(payload, secret)}`;
}

export function verifyToken(
  token: string,
  secret: string
): { raterId: string; period: 1 | 2 } | null {
  const lastDot = token.lastIndexOf(".");
  if (lastDot === -1) return null;
  const payload = token.slice(0, lastDot);
  const sig = token.slice(lastDot + 1);
  if (!safeEqual(mac(payload, secret), sig)) return null;
  try {
    const { raterId, period } = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8")
    );
    if ((period !== 1 && period !== 2) || typeof raterId !== "string") return null;
    return { raterId, period };
  } catch {
    return null;
  }
}

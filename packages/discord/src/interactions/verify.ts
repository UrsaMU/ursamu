/**
 * Discord Interactions signature verification (Ed25519).
 * https://discord.com/developers/docs/interactions/receiving-and-responding
 */

import nacl from "tweetnacl";

function hexToUint8Array(hex: string): Uint8Array {
  const clean = hex.trim().toLowerCase();
  if (clean.length % 2 !== 0) {
    throw new Error("Invalid hex length");
  }
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/**
 * Verify Discord's X-Signature-Ed25519 over (timestamp + body).
 * Returns true only when the signature is valid.
 */
export function verifyDiscordSignature(
  publicKeyHex: string,
  signatureHex: string,
  timestamp: string,
  body: string,
): boolean {
  try {
    const key = hexToUint8Array(publicKeyHex);
    const sig = hexToUint8Array(signatureHex);
    const msg = new TextEncoder().encode(timestamp + body);
    return nacl.sign.detached.verify(msg, sig, key);
  } catch (_e: unknown) {
    return false;
  }
}

/** Extract signature headers from a Request. */
export function readSignatureHeaders(req: Request): {
  signature: string;
  timestamp: string;
} | null {
  const signature = req.headers.get("X-Signature-Ed25519") ?? "";
  const timestamp = req.headers.get("X-Signature-Timestamp") ?? "";
  if (!signature || !timestamp) return null;
  return { signature, timestamp };
}

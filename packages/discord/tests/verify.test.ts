import { assertEquals } from "@std/assert";
import nacl from "tweetnacl";
import {
  verifyDiscordSignature,
  readSignatureHeaders,
} from "../src/interactions/verify.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

Deno.test("verifyDiscordSignature accepts valid Ed25519", OPTS, () => {
  const kp = nacl.sign.keyPair();
  const timestamp = "1700000000";
  const body = JSON.stringify({ type: 1 });
  const msg = new TextEncoder().encode(timestamp + body);
  const sig = nacl.sign.detached(msg, kp.secretKey);

  const ok = verifyDiscordSignature(
    toHex(kp.publicKey),
    toHex(sig),
    timestamp,
    body,
  );
  assertEquals(ok, true);
});

Deno.test("verifyDiscordSignature rejects bad signature", OPTS, () => {
  const kp = nacl.sign.keyPair();
  const other = nacl.sign.keyPair();
  const timestamp = "1700000000";
  const body = '{"type":1}';
  const msg = new TextEncoder().encode(timestamp + body);
  const sig = nacl.sign.detached(msg, other.secretKey);

  const ok = verifyDiscordSignature(
    toHex(kp.publicKey),
    toHex(sig),
    timestamp,
    body,
  );
  assertEquals(ok, false);
});

Deno.test("verifyDiscordSignature rejects garbage hex", OPTS, () => {
  const ok = verifyDiscordSignature("zz", "aa", "1", "{}");
  assertEquals(ok, false);
});

Deno.test("readSignatureHeaders requires both headers", OPTS, () => {
  const missing = new Request("http://x/", {
    headers: { "X-Signature-Ed25519": "abc" },
  });
  assertEquals(readSignatureHeaders(missing), null);

  const full = new Request("http://x/", {
    headers: {
      "X-Signature-Ed25519": "sig",
      "X-Signature-Timestamp": "123",
    },
  });
  assertEquals(readSignatureHeaders(full), {
    signature: "sig",
    timestamp: "123",
  });
});

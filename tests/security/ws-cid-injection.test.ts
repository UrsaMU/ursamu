// RED: Unauthenticated CID injection via plain WS message.
// An unauthenticated socket must NOT be able to claim another player's CID
// by sending { data: { cid: "<victimId>" } } without a valid JWT.
//
// This test MUST FAIL before the patch is applied.

import { assertEquals } from "jsr:@std/assert@^1";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

// Read the WebSocket handler source and assert the vulnerable code path is absent.
// The check is structural — we verify the unauthenticated-cid-set branch is removed.
Deno.test(
  "WS handler does not accept data.data.cid to set identity without JWT verification",
  OPTS,
  async () => {
    const src = await Deno.readTextFile(
      new URL("../../src/services/WebSocket/index.ts", import.meta.url),
    );

    // The vulnerable pattern: setting sockData.cid from data.data.cid without JWT.
    // If this match exists the vulnerability is present — test must fail (Red).
    const hasUnauthCidSet =
      /data\.data\?\.cid\s*&&\s*!sockData\.cid/.test(src) ||
      /sockData\.cid\s*=\s*data\.data\?\.cid/.test(src) ||
      /sockData\.cid\s*=\s*data\.data\.cid/.test(src);

    assertEquals(
      hasUnauthCidSet,
      false,
      "VULNERABLE: WebSocket handler sets sockData.cid from data.data.cid " +
        "without JWT verification — unauthenticated identity takeover possible.",
    );
  },
);

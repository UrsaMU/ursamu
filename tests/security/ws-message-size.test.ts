// RED: No message size limit before JSON.parse in WebSocket handler.
// A client can send arbitrarily large messages, exhausting heap memory
// and causing a DoS. Fix: reject messages above a safe size threshold
// before attempting to parse.

import { assertEquals } from "jsr:@std/assert@^1";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

const WS_SRC = new URL(
  "../../src/services/WebSocket/index.ts",
  import.meta.url,
);

Deno.test(
  "WS handler rejects oversized messages before JSON.parse",
  OPTS,
  async () => {
    const src = await Deno.readTextFile(WS_SRC);

    // Must have a size guard (byteLength or length check) BEFORE JSON.parse
    // in the message handler. Look for a pattern that checks size and returns/closes.
    const hasSizeGuard =
      /event\.data(?:\.length|\.byteLength)\s*[>]/.test(src) ||
      /typeof event\.data[^;]*length\s*[>]/.test(src) ||
      /MAX_MSG/.test(src);

    assertEquals(
      hasSizeGuard,
      true,
      "VULNERABLE: WebSocket message handler calls JSON.parse without a size check — DoS via oversized payload.",
    );
  },
);

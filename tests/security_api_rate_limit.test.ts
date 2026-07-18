/**
 * [MEDIUM] handleRequest API rate map never returned 429.
 *
 * RED:   >API_RATE_LIMIT requests from one IP all succeed.
 * GREEN: excess requests receive 429 + Retry-After.
 */
import { assertEquals, assert } from "@std/assert";
import {
  mushHandleRequest,
  API_RATE_LIMIT,
} from "@ursamu/mush";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

const IP = "198.51.100.99";

Deno.test(
  "[M1] handleRequest returns 429 after API_RATE_LIMIT",
  OPTS,
  async () => {
    let saw429 = false;
    // Burn through the limit with cheap health checks.
    for (let i = 0; i < API_RATE_LIMIT + 5; i++) {
      const req = new Request("http://localhost/health");
      const res = await mushHandleRequest(req, IP);
      if (res.status === 429) {
        saw429 = true;
        assert(
          res.headers.get("Retry-After"),
          "429 must include Retry-After",
        );
        break;
      }
    }
    assertEquals(saw429, true, "expected at least one 429 response");
  },
);

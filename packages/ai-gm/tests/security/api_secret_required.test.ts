/**
 * [CRITICAL] AI-GM REST is open when GM_API_SECRET is unset.
 *
 * In production (or when GM_API_OPEN is not explicitly "1"), missing
 * GM_API_SECRET must fail closed — 401 on all non-webhook routes.
 *
 * RED:   authorized() returns true when secret is empty.
 * GREEN: production / default mode returns 401 without secret.
 */
import { assertEquals } from "@std/assert";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function makeReq(path: string, headers: Record<string, string> = {}): Request {
  return new Request(`http://localhost${path}`, { headers });
}

Deno.test(
  "[C3] without GM_API_SECRET, /api/gm/status returns 401",
  OPTS,
  async () => {
    const prevSecret = Deno.env.get("GM_API_SECRET");
    const prevOpen   = Deno.env.get("GM_API_OPEN");
    const prevEnv    = Deno.env.get("DENO_ENV");
    try {
      Deno.env.delete("GM_API_SECRET");
      Deno.env.delete("GM_API_OPEN");
      Deno.env.set("DENO_ENV", "production");

      // Re-import module so API_SECRET is re-read. Dynamic import cache
      // means we test the exported authorized path via handleGmRequest
      // after forcing env; if module caches secret at load, we assert
      // on the live authorized helper via a fresh import URL.
      const mod = await import(
        `../../api/routes.ts?t=${Date.now()}`
      );
      const res = await mod.handleGmRequest(makeReq("/api/gm/status"));
      assertEquals(res?.status, 401, `expected 401, got ${res?.status}`);
    } finally {
      if (prevSecret !== undefined) Deno.env.set("GM_API_SECRET", prevSecret);
      else Deno.env.delete("GM_API_SECRET");
      if (prevOpen !== undefined) Deno.env.set("GM_API_OPEN", prevOpen);
      else Deno.env.delete("GM_API_OPEN");
      if (prevEnv !== undefined) Deno.env.set("DENO_ENV", prevEnv);
      else Deno.env.delete("DENO_ENV");
    }
  },
);

Deno.test(
  "[C3] GM_API_OPEN=1 allows open mode without secret",
  OPTS,
  async () => {
    const prevSecret = Deno.env.get("GM_API_SECRET");
    const prevOpen   = Deno.env.get("GM_API_OPEN");
    try {
      Deno.env.delete("GM_API_SECRET");
      Deno.env.set("GM_API_OPEN", "1");
      const mod = await import(
        `../../api/routes.ts?open=${Date.now()}`
      );
      const res = await mod.handleGmRequest(makeReq("/api/gm/status"));
      // May be 200 (open) — must not be forced 401 when OPEN=1
      assertEquals(
        res !== null && res.status !== 401,
        true,
        `OPEN=1 must not 401, got ${res?.status}`,
      );
    } finally {
      if (prevSecret !== undefined) Deno.env.set("GM_API_SECRET", prevSecret);
      else Deno.env.delete("GM_API_SECRET");
      if (prevOpen !== undefined) Deno.env.set("GM_API_OPEN", prevOpen);
      else Deno.env.delete("GM_API_OPEN");
    }
  },
);

Deno.test(
  "[C3] valid Bearer secret is accepted",
  OPTS,
  async () => {
    const prevSecret = Deno.env.get("GM_API_SECRET");
    const prevOpen   = Deno.env.get("GM_API_OPEN");
    try {
      Deno.env.set("GM_API_SECRET", "test-secret-value-xyz");
      Deno.env.delete("GM_API_OPEN");
      const mod = await import(
        `../../api/routes.ts?auth=${Date.now()}`
      );
      const res = await mod.handleGmRequest(
        makeReq("/api/gm/status", {
          authorization: "Bearer test-secret-value-xyz",
        }),
      );
      assertEquals(res?.status, 200, `expected 200, got ${res?.status}`);
    } finally {
      if (prevSecret !== undefined) Deno.env.set("GM_API_SECRET", prevSecret);
      else Deno.env.delete("GM_API_SECRET");
      if (prevOpen !== undefined) Deno.env.set("GM_API_OPEN", prevOpen);
      else Deno.env.delete("GM_API_OPEN");
    }
  },
);

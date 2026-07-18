/**
 * [LOW] Register created players with "connected" flag.
 *
 * RED:   new player flags include connected.
 * GREEN: flags are "player" only until real login.
 */
import { assertEquals, assert } from "@std/assert";
import { authHandler, dbojs } from "@ursamu/mush";
import { DBO } from "@ursamu/core";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test(
  "[L2] register does not set connected flag",
  OPTS,
  async () => {
    const name = `RegFlag${Date.now()}`;
    const req = new Request("http://localhost/api/v1/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: name,
        password: "password123!",
        email: `${name}@example.com`,
      }),
    });
    const res = await authHandler(req, "203.0.113.50");
    assertEquals(res.status, 201);
    const body = await res.json() as { id?: string };
    assert(body.id);
    const stored = await dbojs.queryOne({ id: body.id });
    const flags = String(stored?.flags ?? "").toLowerCase();
    assert(
      !/\bconnected\b/.test(flags),
      `register must not set connected: ${flags}`,
    );
    assert(/\bplayer\b/.test(flags), `expected player flag: ${flags}`);
    await dbojs.delete({ id: body.id }).catch(() => {});
    await DBO.close();
  },
);

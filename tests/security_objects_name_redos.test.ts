/**
 * [MEDIUM] GET /objects?name= used unescaped RegExp (ReDoS).
 *
 * RED:   pathological name patterns hang or throw.
 * GREEN: metacharacters are escaped; request completes quickly.
 */
import { assertEquals, assert } from "@std/assert";
import { objectsHandler, dbojs } from "@ursamu/mush";
import { DBO } from "@ursamu/core";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

const ACTOR = "sec_re_act1";

async function cleanup(...ids: string[]) {
  for (const id of ids) await dbojs.delete({ id }).catch(() => {});
}

Deno.test(
  "[M2] name filter with regex metacharacters does not hang",
  OPTS,
  async () => {
    await cleanup(ACTOR);
    await dbojs.create({
      id: ACTOR,
      flags: "player connected",
      data: { name: "ReActor" },
      location: "1",
    });

    const evil = "(a+)+$".repeat(20);
    const url =
      `http://localhost/api/v1/objects?name=${encodeURIComponent(evil)}`;
    const start = performance.now();
    const res = await objectsHandler(
      new Request(url, { method: "GET" }),
      ACTOR,
    );
    const ms = performance.now() - start;
    assertEquals(res.status, 200);
    assert(ms < 2000, `search took too long: ${ms}ms`);
    await cleanup(ACTOR);
    await DBO.close();
  },
);

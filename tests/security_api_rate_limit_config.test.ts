/**
 * The REST rate limit is configurable (server.apiRateLimit,
 * server.apiRateWindowMs; 0 disables) and plugin routes sit outside it.
 */
import { assert, assertEquals } from "@std/assert";
import { API_RATE_LIMIT, mushHandleRequest, registerPluginRoute } from "@ursamu/mush";
import { setConfig } from "@ursamu/core";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

async function burn(ip: string, n: number): Promise<number> {
  let first429 = -1;
  for (let i = 0; i < n; i++) {
    const res = await mushHandleRequest(new Request("http://localhost/health"), ip);
    if (res.status === 429 && first429 < 0) first429 = i;
  }
  return first429;
}

Deno.test("[cfg] server.apiRateLimit lowers the limit", OPTS, async () => {
  setConfig("server.apiRateLimit", 5);
  try {
    const at = await burn("203.0.113.5", 20);
    assertEquals(at, 5, "the sixth request is refused");
  } finally {
    setConfig("server.apiRateLimit", API_RATE_LIMIT);
  }
});

Deno.test("[cfg] server.apiRateLimit 0 turns the limit off", OPTS, async () => {
  setConfig("server.apiRateLimit", 0);
  try {
    const at = await burn("203.0.113.6", API_RATE_LIMIT + 50);
    assertEquals(at, -1, "never refused");
  } finally {
    setConfig("server.apiRateLimit", API_RATE_LIMIT);
  }
});

Deno.test("[cfg] a plugin route is not counted and is served past the limit", OPTS, async () => {
  registerPluginRoute("/rl-test", () => Promise.resolve(new Response("page")));
  setConfig("server.apiRateLimit", 3);
  try {
    const ip = "203.0.113.7";
    // Plugin pages, as many as you like.
    for (let i = 0; i < 10; i++) {
      const res = await mushHandleRequest(new Request("http://localhost/rl-test/p"), ip);
      assertEquals(res.status, 200, `plugin page ${i}`);
    }
    // The API still has its full budget after that.
    assertEquals(await burn(ip, 10), 3);
    // And the plugin page is still served once the API is refused.
    const res = await mushHandleRequest(new Request("http://localhost/rl-test/p"), ip);
    assertEquals(res.status, 200);
    assert(res.status !== 429);
  } finally {
    setConfig("server.apiRateLimit", API_RATE_LIMIT);
  }
});

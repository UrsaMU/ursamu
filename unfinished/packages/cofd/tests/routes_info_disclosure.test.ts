// L1: REST route handler should not leak the plugin identifier to authenticated
// non-staff callers. A simple {ok: true} body confirms the route is live
// without revealing which plugin handles it.

import { assertEquals } from "@std/assert";
import { describe, it } from "@std/testing/bdd";

import { routeHandler } from "../routes.ts";

describe("routeHandler / GET /api/v1/cofd", () => {
  it("returns 401 when userId is null (unauthenticated)", async () => {
    const req = new Request("https://example.invalid/api/v1/cofd", { method: "GET" });
    const res = await routeHandler(req, null);
    assertEquals(res.status, 401);
  });

  it("returns ok:true on authenticated GET", async () => {
    const req = new Request("https://example.invalid/api/v1/cofd", { method: "GET" });
    const res = await routeHandler(req, "user-1");
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.ok, true);
  });

  it("does NOT leak the plugin name in the response body", async () => {
    const req = new Request("https://example.invalid/api/v1/cofd", { method: "GET" });
    const res = await routeHandler(req, "user-1");
    const text = JSON.stringify(await res.json()).toLowerCase();
    if (text.includes("cofd")) {
      throw new Error(`Response leaks plugin name 'cofd': ${text}`);
    }
  });

  it("returns 404 for unknown methods (no plugin name leaked either)", async () => {
    const req = new Request("https://example.invalid/api/v1/cofd", { method: "POST" });
    const res = await routeHandler(req, "user-1");
    assertEquals(res.status, 404);
    const text = JSON.stringify(await res.json()).toLowerCase();
    if (text.includes("cofd")) {
      throw new Error(`404 response leaks plugin name 'cofd': ${text}`);
    }
  });
});

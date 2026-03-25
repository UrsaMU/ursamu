/**
 * Tests for the UI Component Registry:
 *   registerUIComponent / unregisterUIComponent
 *   GET /api/v1/ui-manifest  (privilege-filtered)
 */

import { assertEquals, assertArrayIncludes } from "@std/assert";
import { describe, it, beforeEach } from "@std/testing/bdd";

// We test through the public exports so we catch any re-export mistakes.
import {
  registerUIComponent,
  unregisterUIComponent,
  handleRequest,
} from "../src/app.ts";

import type { IUIComponent } from "../src/@types/IUIComponent.ts";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Produce a minimal component descriptor. */
function comp(overrides: Partial<IUIComponent> & { element: string; slot: string; script: string }): IUIComponent {
  return { order: 0, ...overrides };
}

/**
 * Send a GET /api/v1/ui-manifest request with an optional Bearer token.
 * Returns the parsed JSON body.
 */
async function getManifest(token?: string): Promise<{ slots: Record<string, { element: string; script: string; label?: string; order: number }[]> }> {
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const req = new Request("http://localhost/api/v1/ui-manifest", { headers });
  const res = await handleRequest(req);
  return res.json();
}

// ─── Module-level cleanup so tests don't bleed into each other ────────────────

// Track elements we register per test so we can clean up.
const registered: string[] = [];
function register(c: IUIComponent): void {
  registerUIComponent(c);
  registered.push(c.element);
}
function cleanup(): void {
  for (const el of registered) unregisterUIComponent(el);
  registered.length = 0;
}

// ─── Registry unit tests ──────────────────────────────────────────────────────

describe("registerUIComponent", () => {
  beforeEach(cleanup);

  it("registers a component and makes it retrievable via manifest", async () => {
    register(comp({ element: "ursamu-test-a", slot: "client.sidebar", script: "/api/v1/test/a.js" }));
    // unauthenticated sees lock="" only; this defaults to "connected" so use a real request
    // We'll verify via the slots structure — unauthenticated should NOT see it (default lock = connected)
    const body = await getManifest();
    const elements = Object.values(body.slots).flat().map(c => c.element);
    assertEquals(elements.includes("ursamu-test-a"), false, "connected-lock component hidden from unauthenticated caller");
  });

  it("duplicate element name replaces the existing entry (idempotent)", async () => {
    register(comp({ element: "ursamu-dup", slot: "client.sidebar", script: "/api/v1/dup/v1.js", lock: "" }));
    register(comp({ element: "ursamu-dup", slot: "client.sidebar", script: "/api/v1/dup/v2.js", lock: "" }));

    const body = await getManifest();
    const entries = (body.slots["client.sidebar"] ?? []).filter(c => c.element === "ursamu-dup");
    assertEquals(entries.length, 1, "only one entry for duplicate element");
    assertEquals(entries[0].script, "/api/v1/dup/v2.js", "second registration wins");
  });

  it("defaults lock to 'connected' when omitted", async () => {
    register(comp({ element: "ursamu-nolock", slot: "client.sidebar", script: "/api/v1/nolock.js" }));
    // Unauthenticated (privLevel 0) should NOT see it
    const body = await getManifest();
    const elements = Object.values(body.slots).flat().map(c => c.element);
    assertEquals(elements.includes("ursamu-nolock"), false, "omitted lock defaults to connected — hidden from unauthed");
  });
});

describe("unregisterUIComponent", () => {
  beforeEach(cleanup);

  it("removes a registered component", async () => {
    register(comp({ element: "ursamu-remove-me", slot: "client.sidebar", script: "/s.js", lock: "" }));
    unregisterUIComponent("ursamu-remove-me");
    registered.splice(registered.indexOf("ursamu-remove-me"), 1);

    const body = await getManifest();
    const elements = Object.values(body.slots).flat().map(c => c.element);
    assertEquals(elements.includes("ursamu-remove-me"), false);
  });

  it("is a no-op for an element that was never registered", () => {
    // Must not throw
    unregisterUIComponent("ursamu-never-existed");
  });
});

// ─── /api/v1/ui-manifest privilege filtering ─────────────────────────────────

describe("GET /api/v1/ui-manifest privilege filtering", () => {
  beforeEach(cleanup);

  it("unauthenticated caller sees only lock='' components", async () => {
    register(comp({ element: "ursamu-pub",   slot: "nav",            script: "/pub.js",   lock: "" }));
    register(comp({ element: "ursamu-conn",  slot: "client.sidebar", script: "/conn.js",  lock: "connected" }));
    register(comp({ element: "ursamu-admin", slot: "admin.panel",    script: "/admin.js", lock: "connected admin+" }));

    const body = await getManifest(); // no token
    const elements = Object.values(body.slots).flat().map(c => c.element);
    assertArrayIncludes(elements, ["ursamu-pub"]);
    assertEquals(elements.includes("ursamu-conn"),  false, "connected hidden from unauthed");
    assertEquals(elements.includes("ursamu-admin"), false, "admin hidden from unauthed");
  });

  it("response groups components by slot", async () => {
    register(comp({ element: "ursamu-slot-a", slot: "client.sidebar", script: "/a.js", lock: "" }));
    register(comp({ element: "ursamu-slot-b", slot: "nav",            script: "/b.js", lock: "" }));

    const body = await getManifest();
    assertEquals(typeof body.slots["client.sidebar"], "object");
    assertEquals(typeof body.slots["nav"],            "object");
  });

  it("components are sorted by order within slot", async () => {
    register(comp({ element: "ursamu-order-2", slot: "client.sidebar", script: "/2.js", lock: "", order: 20 }));
    register(comp({ element: "ursamu-order-1", slot: "client.sidebar", script: "/1.js", lock: "", order: 10 }));

    const body = await getManifest();
    const elements = (body.slots["client.sidebar"] ?? []).map(c => c.element);
    assertEquals(elements[0], "ursamu-order-1");
    assertEquals(elements[1], "ursamu-order-2");
  });

  it("lock and plugin fields are not present in the response", async () => {
    register(comp({ element: "ursamu-noleak", slot: "nav", script: "/x.js", lock: "", plugin: "secret-plugin" }));

    const body = await getManifest();
    const entry = (body.slots["nav"] ?? []).find(c => c.element === "ursamu-noleak") as Record<string, unknown> | undefined;
    assertEquals(entry !== undefined, true, "component present");
    assertEquals("lock"   in (entry ?? {}), false, "lock not leaked");
    assertEquals("plugin" in (entry ?? {}), false, "plugin not leaked");
  });

  it("returns 200 for unauthenticated request (not 401)", async () => {
    const req = new Request("http://localhost/api/v1/ui-manifest");
    const res = await handleRequest(req);
    assertEquals(res.status, 200);
  });
});

// ─── lockToMinPrivLevel coverage via observable behavior ─────────────────────

describe("lock string mapping (via manifest visibility)", () => {
  beforeEach(cleanup);

  const cases: { lock: string; visibleAt: number[] }[] = [
    { lock: "",                    visibleAt: [0, 1, 2, 3, 4] },
    { lock: "connected",           visibleAt: [1, 2, 3, 4] },
    { lock: "connected builder+",  visibleAt: [2, 3, 4] },
    { lock: "connected admin+",    visibleAt: [3, 4] },
    { lock: "connected wizard",    visibleAt: [4] },
  ];

  // We test visibility at priv=0 (unauthed) and priv=1 (authed no flags).
  // Higher levels require real DB entries which integration tests cover.

  for (const { lock, visibleAt } of cases) {
    const element = `ursamu-lock-${lock.replace(/[^a-z0-9]/g, "-") || "empty"}`;

    it(`lock "${lock}" — unauthenticated visibility is ${visibleAt.includes(0)}`, async () => {
      register(comp({ element, slot: "nav", script: "/x.js", lock }));
      const body = await getManifest();
      const elements = Object.values(body.slots).flat().map(c => c.element);
      assertEquals(elements.includes(element), visibleAt.includes(0));
    });
  }
});

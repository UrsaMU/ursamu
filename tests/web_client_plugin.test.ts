/**
 * Tests for src/plugins/web-client/index.ts
 *
 * Covers:
 *   - plugin.init() returns true and registers core components
 *   - plugin.remove() cleans up all registered components
 *   - staticHandler serves expected files with correct MIME types
 *   - staticHandler blocks path traversal attempts
 *   - staticHandler returns 404 for unknown paths
 *   - staticHandler returns 405 for non-GET methods
 */

import { assertEquals, assertStringIncludes } from "jsr:@std/assert";
import { describe, it, beforeEach, afterEach } from "jsr:@std/testing/bdd";

import webClientPlugin from "../src/plugins/web-client/index.ts";
import { handleRequest, unregisterUIComponent, getRegisteredUIComponents } from "../src/app.ts";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CORE_ELEMENTS = ["ursamu-output", "ursamu-input", "ursamu-who"];

/** Registry snapshot — includes all components regardless of privilege level. */
function registeredElements(): string[] {
  return getRegisteredUIComponents().map((c) => c.element);
}

async function getManifest(): Promise<Record<string, { element: string }[]>> {
  const res  = await handleRequest(new Request("http://localhost/api/v1/ui-manifest"));
  const body = await res.json() as { slots: Record<string, { element: string }[]> };
  return body.slots;
}

function staticGet(path: string): Promise<Response> {
  return handleRequest(new Request(`http://localhost${path}`));
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

describe("web-client plugin — lifecycle", () => {
  afterEach(async () => {
    // Always clean up to avoid cross-test pollution
    if (webClientPlugin.remove) await webClientPlugin.remove();
    // Belt-and-suspenders: force remove each element individually
    for (const el of CORE_ELEMENTS) unregisterUIComponent(el);
  });

  it("init() returns true", async () => {
    const result = await webClientPlugin.init?.();
    assertEquals(result, true);
  });

  it("init() registers all three core components", async () => {
    await webClientPlugin.init?.();
    const elements = registeredElements();
    for (const el of CORE_ELEMENTS) {
      assertEquals(elements.includes(el), true, `${el} should be registered`);
    }
  });

  it("remove() unregisters all three core components", async () => {
    await webClientPlugin.init?.();
    await webClientPlugin.remove?.();
    const elements = registeredElements();
    for (const el of CORE_ELEMENTS) {
      assertEquals(elements.includes(el), false, `${el} should be gone after remove()`);
    }
  });

  it("init() is idempotent — calling twice does not duplicate components", async () => {
    await webClientPlugin.init?.();
    await webClientPlugin.init?.();
    const elements = registeredElements();
    for (const el of CORE_ELEMENTS) {
      const count = elements.filter((e) => e === el).length;
      assertEquals(count, 1, `${el} should appear exactly once after double init()`);
    }
  });
});

// ─── Static file serving ─────────────────────────────────────────────────────

describe("web-client plugin — static file serving", () => {
  beforeEach(async () => { await webClientPlugin.init?.(); });
  afterEach(async () => {
    if (webClientPlugin.remove) await webClientPlugin.remove();
    for (const el of CORE_ELEMENTS) unregisterUIComponent(el);
  });

  it("GET /client serves index.html with text/html", async () => {
    const res = await staticGet("/client");
    assertEquals(res.status, 200);
    assertStringIncludes(res.headers.get("content-type") ?? "", "text/html");
    assertStringIncludes(await res.text(), "<!DOCTYPE html>");
  });

  it("GET /client/ (trailing slash) serves index.html", async () => {
    const res = await staticGet("/client/");
    assertEquals(res.status, 200);
    assertStringIncludes(await res.text(), "<!DOCTYPE html>");
  });

  it("GET /client/style.css serves text/css", async () => {
    const res = await staticGet("/client/style.css");
    assertEquals(res.status, 200);
    assertStringIncludes(res.headers.get("content-type") ?? "", "text/css");
    assertStringIncludes(await res.text(), ":root");
  });

  it("GET /client/client.js serves text/javascript", async () => {
    const res = await staticGet("/client/client.js");
    assertEquals(res.status, 200);
    assertStringIncludes(res.headers.get("content-type") ?? "", "javascript");
  });

  it("GET /client/components/ursamu-output.js serves a web component", async () => {
    const res = await staticGet("/client/components/ursamu-output.js");
    assertEquals(res.status, 200);
    assertStringIncludes(await res.text(), "customElements.define");
  });

  it("GET /client/components/ursamu-input.js serves a web component", async () => {
    const res = await staticGet("/client/components/ursamu-input.js");
    assertEquals(res.status, 200);
    assertStringIncludes(await res.text(), "customElements.define");
  });

  it("GET /client/components/ursamu-who.js serves a web component", async () => {
    const res = await staticGet("/client/components/ursamu-who.js");
    assertEquals(res.status, 200);
    assertStringIncludes(await res.text(), "customElements.define");
  });

  it("GET /client/does-not-exist returns 404", async () => {
    const res = await staticGet("/client/does-not-exist.txt");
    assertEquals(res.status, 404);
  });
});

// ─── Security ─────────────────────────────────────────────────────────────────

describe("web-client plugin — path traversal guard", () => {
  beforeEach(async () => { await webClientPlugin.init?.(); });
  afterEach(async () => {
    if (webClientPlugin.remove) await webClientPlugin.remove();
    for (const el of CORE_ELEMENTS) unregisterUIComponent(el);
  });

  const traversalPaths = [
    "/client/../../../etc/passwd",
    "/client/../../deno.json",
    "/client/%2e%2e%2fetc%2fpasswd",
    "/client/components/../../deno.json",
  ];

  for (const path of traversalPaths) {
    it(`blocks path traversal: ${path}`, async () => {
      const res = await staticGet(path);
      // Must be 404 — never serve files outside static/
      assertEquals(res.status, 404, `Expected 404 for traversal attempt: ${path}`);
    });
  }

  it("POST /client returns 405", async () => {
    const res = await handleRequest(
      new Request("http://localhost/client", { method: "POST" })
    );
    assertEquals(res.status, 405);
  });
});

// ─── Component slot assignments ───────────────────────────────────────────────

describe("web-client plugin — component slot assignments", () => {
  beforeEach(async () => { await webClientPlugin.init?.(); });
  afterEach(async () => {
    if (webClientPlugin.remove) await webClientPlugin.remove();
    for (const el of CORE_ELEMENTS) unregisterUIComponent(el);
  });

  it("ursamu-output is in client.output slot", () => {
    const comp = getRegisteredUIComponents().find((c) => c.element === "ursamu-output");
    assertEquals(comp?.slot, "client.output");
  });

  it("ursamu-input is in client.input slot", () => {
    const comp = getRegisteredUIComponents().find((c) => c.element === "ursamu-input");
    assertEquals(comp?.slot, "client.input");
  });

  it("ursamu-who is in client.sidebar slot", () => {
    const comp = getRegisteredUIComponents().find((c) => c.element === "ursamu-who");
    assertEquals(comp?.slot, "client.sidebar");
  });

  it("all core components have lock 'connected' — hidden from unauthenticated manifest", async () => {
    // Unauthenticated request — no Bearer token
    const res   = await handleRequest(new Request("http://localhost/api/v1/ui-manifest"));
    const body  = await res.json() as { slots: Record<string, { element: string }[]> };
    const mounted = Object.values(body.slots).flat().map((c) => c.element);
    for (const el of CORE_ELEMENTS) {
      assertEquals(mounted.includes(el), false, `${el} must be hidden from unauthenticated callers`);
    }
  });
});

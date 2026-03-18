/**
 * tests/wiki_router.test.ts
 *
 * Tests for wikiRouteHandler, safePath, and mimeForPath
 * (src/plugins/wiki/router.ts).
 *
 * Strategy: WIKI_DIR resolves to `${Deno.cwd()}/wiki`. We create real temp
 * files prefixed with __test__ inside ./wiki/ before the relevant tests and
 * clean them up afterward.
 */
import { assertEquals } from "https://deno.land/std@0.220.0/assert/mod.ts";
import { join, resolve } from "@std/path";
import { ensureDir } from "@std/fs";
import {
  wikiRouteHandler,
  safePath,
  mimeForPath,
} from "../src/plugins/wiki/router.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

// ─── helpers ──────────────────────────────────────────────────────────────────

function req(method: string, path: string, body?: unknown): Request {
  return new Request(`http://localhost${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function call<T = unknown>(
  method: string,
  path: string,
  userId: string | null,
  body?: unknown,
): Promise<{ status: number; data: T }> {
  const r = req(method, path, body);
  const res = await wikiRouteHandler(r, userId);
  const data = await res.json() as T;
  return { status: res.status, data };
}

const WIKI_DIR = "./wiki";

const TEST_FILE = join(WIKI_DIR, "__test__page.md");
const TEST_DIR  = join(WIKI_DIR, "__test__dir");
const TEST_CHILD = join(TEST_DIR, "__test__child.md");

async function setupTestFiles() {
  await Deno.writeTextFile(
    TEST_FILE,
    `---\ntitle: Test Page\nauthor: Tester\ntags: [test, example]\n---\n\nHello test world.`,
  );
  await ensureDir(TEST_DIR);
  await Deno.writeTextFile(
    TEST_CHILD,
    `---\ntitle: Child Page\n---\n\nChild body.`,
  );
}

async function cleanupTestFiles() {
  try { await Deno.remove(TEST_FILE); } catch { /* ok */ }
  try { await Deno.remove(TEST_DIR, { recursive: true }); } catch { /* ok */ }
}

// ─── mimeForPath ──────────────────────────────────────────────────────────────

Deno.test("mimeForPath — .jpg returns image/jpeg", OPTS, () => {
  assertEquals(mimeForPath("photo.jpg"), "image/jpeg");
});

Deno.test("mimeForPath — .jpeg returns image/jpeg", OPTS, () => {
  assertEquals(mimeForPath("photo.jpeg"), "image/jpeg");
});

Deno.test("mimeForPath — .png returns image/png", OPTS, () => {
  assertEquals(mimeForPath("banner.png"), "image/png");
});

Deno.test("mimeForPath — .gif returns image/gif", OPTS, () => {
  assertEquals(mimeForPath("anim.gif"), "image/gif");
});

Deno.test("mimeForPath — .webp returns image/webp", OPTS, () => {
  assertEquals(mimeForPath("img.webp"), "image/webp");
});

Deno.test("mimeForPath — .svg returns image/svg+xml", OPTS, () => {
  assertEquals(mimeForPath("icon.svg"), "image/svg+xml");
});

Deno.test("mimeForPath — .pdf returns application/pdf", OPTS, () => {
  assertEquals(mimeForPath("doc.pdf"), "application/pdf");
});

Deno.test("mimeForPath — .md returns null (not an allowed media type)", OPTS, () => {
  assertEquals(mimeForPath("page.md"), null);
});

Deno.test("mimeForPath — .txt returns null", OPTS, () => {
  assertEquals(mimeForPath("notes.txt"), null);
});

Deno.test("mimeForPath — .exe returns null", OPTS, () => {
  assertEquals(mimeForPath("evil.exe"), null);
});

Deno.test("mimeForPath — uppercase extension is normalised", OPTS, () => {
  assertEquals(mimeForPath("PHOTO.PNG"), "image/png");
});

// ─── safePath ─────────────────────────────────────────────────────────────────

Deno.test("safePath — valid subpath returns absolute path", OPTS, () => {
  const result = safePath("news/battle");
  const base = resolve(WIKI_DIR);
  assertEquals(result !== null, true);
  assertEquals(result!.startsWith(base + "/"), true);
});

Deno.test("safePath — empty string returns the base dir itself", OPTS, () => {
  const result = safePath("");
  const base = resolve(WIKI_DIR);
  assertEquals(result, base);
});

Deno.test("safePath — path traversal ../../etc/passwd returns null", OPTS, () => {
  assertEquals(safePath("../../etc/passwd"), null);
});

Deno.test("safePath — path traversal ../outside returns null", OPTS, () => {
  assertEquals(safePath("../outside"), null);
});

Deno.test("safePath — deeply nested traversal returns null", OPTS, () => {
  assertEquals(safePath("news/../../../../../../etc/hosts"), null);
});

Deno.test("safePath — normal nested path is safe", OPTS, () => {
  const result = safePath("lore/history/ancient");
  assertEquals(result !== null, true);
});

// ─── GET /api/v1/wiki — list all pages ───────────────────────────────────────

Deno.test("wikiRouteHandler — GET /api/v1/wiki lists pages", OPTS, async () => {
  await setupTestFiles();
  try {
    const { status, data } = await call<Array<{ path: string; title: string; type: string }>>(
      "GET", "/api/v1/wiki", null,
    );
    assertEquals(status, 200);
    assertEquals(Array.isArray(data), true);
    // Should include our test page
    const testPage = data.find((p) => p.path === "__test__page");
    assertEquals(testPage !== undefined, true);
    assertEquals(testPage?.title, "Test Page");
    assertEquals(testPage?.type, "page");
  } finally {
    await cleanupTestFiles();
  }
});

// ─── GET /api/v1/wiki?q=<query> — search ─────────────────────────────────────

Deno.test("wikiRouteHandler — GET /api/v1/wiki?q= returns matching pages", OPTS, async () => {
  await setupTestFiles();
  try {
    const { status, data } = await call<Array<{ path: string; title: string }>>(
      "GET", "/api/v1/wiki?q=test+world", null,
    );
    assertEquals(status, 200);
    assertEquals(Array.isArray(data), true);
    const hit = data.find((p) => p.path === "__test__page");
    assertEquals(hit !== undefined, true);
    assertEquals(hit?.title, "Test Page");
  } finally {
    await cleanupTestFiles();
  }
});

Deno.test("wikiRouteHandler — GET /api/v1/wiki?q= matches by title", OPTS, async () => {
  await setupTestFiles();
  try {
    const { status, data } = await call<Array<{ path: string }>>(
      "GET", "/api/v1/wiki?q=Test+Page", null,
    );
    assertEquals(status, 200);
    assertEquals(Array.isArray(data), true);
    const hit = data.find((p) => p.path === "__test__page");
    assertEquals(hit !== undefined, true);
  } finally {
    await cleanupTestFiles();
  }
});

Deno.test("wikiRouteHandler — GET /api/v1/wiki?q= matches by tag", OPTS, async () => {
  await setupTestFiles();
  try {
    const { status, data } = await call<Array<{ path: string }>>(
      "GET", "/api/v1/wiki?q=example", null,
    );
    assertEquals(status, 200);
    const hit = data.find((p) => p.path === "__test__page");
    assertEquals(hit !== undefined, true);
  } finally {
    await cleanupTestFiles();
  }
});

Deno.test("wikiRouteHandler — GET /api/v1/wiki?q= returns empty array for no match", OPTS, async () => {
  await setupTestFiles();
  try {
    const { status, data } = await call<Array<unknown>>(
      "GET", "/api/v1/wiki?q=zzznomatchzzz999", null,
    );
    assertEquals(status, 200);
    assertEquals(Array.isArray(data), true);
    assertEquals(data.length, 0);
  } finally {
    await cleanupTestFiles();
  }
});

// ─── GET /api/v1/wiki/<path> — single page ───────────────────────────────────

Deno.test("wikiRouteHandler — GET /api/v1/wiki/<path> reads a page", OPTS, async () => {
  await setupTestFiles();
  try {
    const { status, data } = await call<{ path: string; title: string; body: string; author: string }>(
      "GET", "/api/v1/wiki/__test__page", null,
    );
    assertEquals(status, 200);
    assertEquals(data.path, "__test__page");
    assertEquals(data.title, "Test Page");
    assertEquals(data.author, "Tester");
    assertEquals(data.body, "Hello test world.");
  } finally {
    await cleanupTestFiles();
  }
});

Deno.test("wikiRouteHandler — GET /api/v1/wiki/<path> returns 404 for missing page", OPTS, async () => {
  const { status } = await call(
    "GET", "/api/v1/wiki/__test__nonexistent_zzz", null,
  );
  assertEquals(status, 404);
});

// ─── GET /api/v1/wiki/<dir> — directory listing ──────────────────────────────

Deno.test("wikiRouteHandler — GET /api/v1/wiki/<dir> returns directory listing", OPTS, async () => {
  await setupTestFiles();
  try {
    const { status, data } = await call<{
      path: string;
      type: string;
      children: Array<{ path: string; title: string; type: string }>;
    }>(
      "GET", "/api/v1/wiki/__test__dir", null,
    );
    assertEquals(status, 200);
    assertEquals(data.path, "__test__dir");
    assertEquals(data.type, "directory");
    assertEquals(Array.isArray(data.children), true);
    const child = data.children.find((c) => c.path === "__test__dir/__test__child");
    assertEquals(child !== undefined, true);
    assertEquals(child?.title, "Child Page");
    assertEquals(child?.type, "page");
  } finally {
    await cleanupTestFiles();
  }
});

// ─── GET — static asset (non-.md extension) ──────────────────────────────────

Deno.test("wikiRouteHandler — GET static asset: 404 when file not found", OPTS, async () => {
  const { status } = await call(
    "GET", "/api/v1/wiki/__test__nonexistent.png", null,
  );
  assertEquals(status, 404);
});

Deno.test("wikiRouteHandler — GET static asset: 415 for unsupported extension", OPTS, async () => {
  const { status } = await call(
    "GET", "/api/v1/wiki/__test__file.txt", null,
  );
  assertEquals(status, 415);
});

// ─── POST auth guard ─────────────────────────────────────────────────────────

Deno.test("wikiRouteHandler — POST /api/v1/wiki returns 403 when userId is null", OPTS, async () => {
  const { status, data } = await call<{ error: string }>(
    "POST", "/api/v1/wiki", null,
    { path: "test/auth-check", body: "Test body." },
  );
  assertEquals(status, 403);
  assertEquals(data.error, "Forbidden");
});

// ─── PATCH auth guard ────────────────────────────────────────────────────────

Deno.test("wikiRouteHandler — PATCH /api/v1/wiki/<path> returns 403 when userId is null", OPTS, async () => {
  const { status, data } = await call<{ error: string }>(
    "PATCH", "/api/v1/wiki/__test__page", null,
    { body: "New content." },
  );
  assertEquals(status, 403);
  assertEquals(data.error, "Forbidden");
});

// ─── DELETE auth guard ───────────────────────────────────────────────────────

Deno.test("wikiRouteHandler — DELETE /api/v1/wiki/<path> returns 403 when userId is null", OPTS, async () => {
  const { status, data } = await call<{ error: string }>(
    "DELETE", "/api/v1/wiki/__test__page", null,
  );
  assertEquals(status, 403);
  assertEquals(data.error, "Forbidden");
});

// ─── PUT auth guard ──────────────────────────────────────────────────────────

Deno.test("wikiRouteHandler — PUT /api/v1/wiki/<path> returns 403 when userId is null", OPTS, async () => {
  const r = new Request("http://localhost/api/v1/wiki/__test__image.png", {
    method: "PUT",
    body: new Uint8Array([1, 2, 3]),
  });
  const res = await wikiRouteHandler(r, null);
  assertEquals(res.status, 403);
});

// ─── path traversal guard ────────────────────────────────────────────────────

Deno.test("wikiRouteHandler — safePath rejects traversal (unit check)", OPTS, () => {
  // The URL constructor normalizes traversal before the handler sees it,
  // but safePath itself must reject raw traversal strings.
  assertEquals(safePath("../../etc/passwd"), null);
  assertEquals(safePath("../secret"), null);
  assertEquals(safePath("news/../../../etc/hosts"), null);
});

// ─── unknown method ──────────────────────────────────────────────────────────

Deno.test("wikiRouteHandler — unknown method on wiki path returns 404", OPTS, async () => {
  const r = new Request("http://localhost/api/v1/wiki/__test__page", {
    method: "OPTIONS",
  });
  const res = await wikiRouteHandler(r, null);
  assertEquals(res.status, 404);
});

Deno.test("wikiRouteHandler — unknown method on root returns 404", OPTS, async () => {
  const r = new Request("http://localhost/api/v1/wiki", {
    method: "HEAD",
  });
  const res = await wikiRouteHandler(r, null);
  assertEquals(res.status, 404);
});

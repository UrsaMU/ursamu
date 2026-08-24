/**
 * REST handlers — pure dispatch without full engine boot.
 */
import { assertEquals, assert } from "@std/assert";
import { meta, chargenOptions } from "../src/chargen/http.ts";
import { routeHandler } from "../routes.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("GET /api/v1/dnd/meta is public", OPTS, async () => {
  const res = await routeHandler(
    new Request("http://x/api/v1/dnd/meta"),
    null,
  );
  assertEquals(res.status, 200);
  const j = await res.json();
  assertEquals(j.system, "dnd");
  assertEquals(j.chargenApi, "/api/v1/dnd/chargen");
  assert(j.sheetApi);
});

Deno.test("meta() helper shape", OPTS, async () => {
  const j = await meta().json();
  assertEquals(j.ok, true);
  assertEquals(j.name.includes("D&D"), true);
});

Deno.test("chargen options lists classes", OPTS, async () => {
  const j = await chargenOptions("classes").json();
  assertEquals(j.ok, true);
  assert(j.items.length >= 12);
  assert(j.items.some((i: { slug: string }) =>
    i.slug === "fighter"
  ));
});

Deno.test("chargen options lists backgrounds", OPTS, async () => {
  const j = await chargenOptions("backgrounds").json();
  assertEquals(j.ok, true);
  assert(j.items.some((i: { slug: string }) =>
    i.slug === "soldier"
  ));
});

Deno.test("chargen routes require auth", OPTS, async () => {
  const res = await routeHandler(
    new Request("http://x/api/v1/dnd/chargen"),
    null,
  );
  assertEquals(res.status, 401);
});

Deno.test("sheet route requires auth", OPTS, async () => {
  const res = await routeHandler(
    new Request("http://x/api/v1/dnd/sheet"),
    null,
  );
  assertEquals(res.status, 401);
});

Deno.test("liveness requires auth", OPTS, async () => {
  const res = await routeHandler(
    new Request("http://x/api/v1/dnd"),
    null,
  );
  assertEquals(res.status, 401);
});

Deno.test("options is public", OPTS, async () => {
  const res = await routeHandler(
    new Request("http://x/api/v1/dnd/chargen/options?topic=feats"),
    null,
  );
  assertEquals(res.status, 200);
  const j = await res.json();
  assert(j.items.length >= 5);
});

Deno.test("options skills filtered by class", OPTS, async () => {
  const res = await routeHandler(
    new Request(
      "http://x/api/v1/dnd/chargen/options?topic=skills&class=fighter",
    ),
    null,
  );
  assertEquals(res.status, 200);
  const j = await res.json();
  assert(j.skillCount >= 2);
  assert(j.items.length >= 2);
  assert(
    j.items.some((i: { slug: string }) =>
      i.slug === "athletics"
    ),
  );
});

Deno.test("options spells for wizard", OPTS, async () => {
  const j = await chargenOptions("spells", {
    class: "wizard",
  }).json();
  assertEquals(j.ok, true);
  assert(j.items.length >= 3);
  assert(
    j.items.some((i: { slug: string }) =>
      i.slug === "magic_missile"
    ),
  );
});

Deno.test("unknown path 404", OPTS, async () => {
  const res = await routeHandler(
    new Request("http://x/api/v1/dnd/nope", {
      headers: { Authorization: "x" },
    }),
    "1",
  );
  assertEquals(res.status, 404);
});

import { assertEquals } from "@std/assert";

import { validateEntity } from "../entities.ts";
import { MAX_VISION, type MapEntity } from "../schemas.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

const base = (over: Partial<MapEntity> = {}): MapEntity => ({
  id: "ent-1",
  coord: { x: 0, y: 0, z: 0 },
  glyph: "R",
  kind: "vehicle",
  name: "Recon Walker",
  vision: 5,
  ...over,
});

Deno.test("validateEntity: happy path", OPTS, () => {
  assertEquals(validateEntity(base()), true);
});

Deno.test("validateEntity: accepts all optional fields omitted", OPTS, () => {
  assertEquals(validateEntity(base()), true);
});

Deno.test("validateEntity: accepts all optional fields present and valid", OPTS, () => {
  const e = base({
    factionId: "republic",
    containerId: "#42",
    controllerId: "#99",
    status: "advancing through brush",
    hidden: true,
    lastDock: "#100",
  });
  assertEquals(validateEntity(e), true);
});

Deno.test("validateEntity: rejects empty id", OPTS, () => {
  assertEquals(validateEntity(base({ id: "" })), false);
});

Deno.test("validateEntity: rejects id too long (65 chars)", OPTS, () => {
  assertEquals(validateEntity(base({ id: "a".repeat(65) })), false);
});

Deno.test("validateEntity: rejects non-int coord", OPTS, () => {
  assertEquals(
    validateEntity(base({ coord: { x: 1.5, y: 0, z: 0 } })),
    false,
  );
});

Deno.test("validateEntity: rejects coord > 1e6", OPTS, () => {
  assertEquals(
    validateEntity(base({ coord: { x: 1e7, y: 0, z: 0 } })),
    false,
  );
});

Deno.test("validateEntity: rejects multi-char glyph", OPTS, () => {
  assertEquals(validateEntity(base({ glyph: "ab" })), false);
});

Deno.test("validateEntity: rejects empty name", OPTS, () => {
  assertEquals(validateEntity(base({ name: "" })), false);
});

Deno.test("validateEntity: rejects name with [", OPTS, () => {
  assertEquals(validateEntity(base({ name: "Bad[name" })), false);
});

Deno.test("validateEntity: rejects name with ]", OPTS, () => {
  assertEquals(validateEntity(base({ name: "Bad]name" })), false);
});

Deno.test("validateEntity: rejects vision > MAX_VISION", OPTS, () => {
  assertEquals(validateEntity(base({ vision: MAX_VISION + 1 })), false);
});

Deno.test("validateEntity: rejects negative vision", OPTS, () => {
  assertEquals(validateEntity(base({ vision: -1 })), false);
});

import { assertEquals } from "@std/assert";
import { canStackWith } from "../commands_internals.ts";
import type { MapEntity } from "../schemas.ts";

const make = (
  id: string,
  factionId?: string,
  extra: Partial<MapEntity> = {},
): MapEntity => ({
  id,
  coord: { x: 0, y: 0, z: 0 },
  glyph: "@",
  kind: "squad",
  name: id,
  vision: 4,
  factionId,
  ...extra,
});

Deno.test("canStackWith: empty tile is always enterable", () => {
  const result = canStackWith({ id: "m1", factionId: "rebels" }, []);
  assertEquals(result.ok, true);
});

Deno.test("canStackWith: same-faction occupant allows stacking", () => {
  const result = canStackWith(
    { id: "m1", factionId: "rebels" },
    [make("o1", "rebels")],
  );
  assertEquals(result.ok, true);
});

Deno.test("canStackWith: multiple same-faction occupants allow stacking", () => {
  const result = canStackWith(
    { id: "m1", factionId: "rebels" },
    [make("o1", "rebels"), make("o2", "rebels"), make("o3", "rebels")],
  );
  assertEquals(result.ok, true);
});

Deno.test("canStackWith: different-faction occupant blocks with hostile reason", () => {
  const result = canStackWith(
    { id: "m1", factionId: "rebels" },
    [make("o1", "empire")],
  );
  assertEquals(result, { ok: false, reason: "hostile entity blocks the tile" });
});

Deno.test("canStackWith: factionless mover, factioned occupant blocks", () => {
  const result = canStackWith(
    { id: "m1", factionId: undefined },
    [make("o1", "rebels")],
  );
  assertEquals(result.ok, false);
});

Deno.test("canStackWith: factioned mover, factionless occupant blocks", () => {
  const result = canStackWith(
    { id: "m1", factionId: "rebels" },
    [make("o1", undefined)],
  );
  assertEquals(result.ok, false);
});

Deno.test("canStackWith: factionless on both sides blocks", () => {
  const result = canStackWith(
    { id: "m1", factionId: undefined },
    [make("o1", undefined)],
  );
  assertEquals(result.ok, false);
});

Deno.test("canStackWith: occupant with same id as mover is ignored", () => {
  const result = canStackWith(
    { id: "m1", factionId: "rebels" },
    [make("m1", "empire")],
  );
  assertEquals(result.ok, true);
});

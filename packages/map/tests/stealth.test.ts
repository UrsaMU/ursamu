import { assert, assertEquals } from "@std/assert";

import { unionVisibleFor } from "../fog.ts";
import { coordKey, isEntityVisibleTo, type MapEntity } from "../schemas.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

const ent = (over: Partial<MapEntity> = {}): MapEntity => ({
  id: "ent",
  coord: { x: 0, y: 0, z: 0 },
  glyph: "R",
  kind: "scout",
  name: "Scout",
  vision: 2,
  ...over,
});

const transparent = () => 0;

Deno.test("isEntityVisibleTo: non-hidden entity always visible", OPTS, () => {
  const target = ent({ hidden: false, factionId: "rebel" });
  const viewer = ent({ factionId: "empire" });
  assert(isEntityVisibleTo(target, viewer));
});

Deno.test(
  "isEntityVisibleTo: hidden factionless entity invisible to anyone",
  OPTS,
  () => {
    const target = ent({ hidden: true });
    const viewer = ent({ factionId: "rebel" });
    assertEquals(isEntityVisibleTo(target, viewer), false);
    assertEquals(isEntityVisibleTo(target, ent({})), false);
  },
);

Deno.test(
  "isEntityVisibleTo: hidden entity visible to faction-mate",
  OPTS,
  () => {
    const target = ent({ hidden: true, factionId: "rebel" });
    const viewer = ent({ factionId: "rebel" });
    assert(isEntityVisibleTo(target, viewer));
  },
);

Deno.test(
  "isEntityVisibleTo: hidden entity invisible to other faction",
  OPTS,
  () => {
    const target = ent({ hidden: true, factionId: "rebel" });
    const viewer = ent({ factionId: "empire" });
    assertEquals(isEntityVisibleTo(target, viewer), false);
  },
);

Deno.test(
  "unionVisibleFor: viewer doesn't gain vision from hidden enemies",
  OPTS,
  () => {
    const viewer = ent({
      id: "viewer",
      factionId: "rebel",
      coord: { x: 0, y: 0, z: 0 },
      vision: 0,
    });
    const enemyScout = ent({
      id: "enemy",
      factionId: "empire",
      hidden: true,
      coord: { x: 50, y: 50, z: 0 },
      vision: 3,
    });
    const live = unionVisibleFor(viewer, [viewer, enemyScout], transparent);
    // viewer only sees own tile; no enemy tiles included
    assert(live.has(coordKey(viewer.coord)));
    assertEquals(live.has(coordKey(enemyScout.coord)), false);
    assertEquals(live.size, 1);
  },
);

Deno.test(
  "unionVisibleFor: viewer DOES gain vision from hidden faction-mates",
  OPTS,
  () => {
    const viewer = ent({
      id: "viewer",
      factionId: "rebel",
      coord: { x: 0, y: 0, z: 0 },
      vision: 0,
    });
    const mate = ent({
      id: "mate",
      factionId: "rebel",
      hidden: true,
      coord: { x: 50, y: 50, z: 0 },
      vision: 1,
    });
    const live = unionVisibleFor(viewer, [viewer, mate], transparent);
    assert(live.has(coordKey(viewer.coord)));
    assert(live.has(coordKey(mate.coord)));
    // mate has vision 1 → at least its own tile + neighbors
    assert(live.size > 1);
  },
);

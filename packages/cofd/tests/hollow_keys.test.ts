// Hollow enhancements + key phrases.

import {
  assert,
  assertEquals,
  assertStringIncludes,
} from "@std/assert";
import { defaultSheet } from "../src/stats/index.ts";
import {
  addHollowEnhancement,
  canOpenWithKey,
  checkPortalEnter,
  defaultHedgeRoom,
  enhancementDotsUsed,
  freeHollowDots,
  hollowHas,
  keyPhraseMatches,
  normalizeKeyPhrase,
} from "../src/hedge/index.ts";
import { checkHobAlarmOnEnter } from "../src/commands/hedge_hollow.ts";
import { hasCondition } from "../src/subsystems/conditions.ts";
import {
  mockPlayer,
  mockU,
  MockObjectStore,
} from "./helpers/mockU.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function ctlSheet() {
  const s = defaultSheet();
  s.template = "changeling";
  s.energyCurrent = 5;
  s.powerStatValue = 2;
  return s;
}

Deno.test("hollow enhancement budget", OPTS, () => {
  let room = defaultHedgeRoom("hollow");
  room = {
    ...room,
    hollow: {
      owners: ["1"],
      rating: 3,
      enhancements: [],
    },
  };
  assertEquals(freeHollowDots(room), 3);
  const r = addHollowEnhancement(room, "hob-alarm");
  assert(r.ok);
  room = r.room!;
  assertEquals(freeHollowDots(room), 2);
  assert(hollowHas(room, "hob-alarm"));
  const r2 = addHollowEnhancement(room, "size-2");
  assert(r2.ok);
  room = r2.room!;
  assertEquals(enhancementDotsUsed(room.hollow!.enhancements), 3);
  assertEquals(freeHollowDots(room), 0);
  const over = addHollowEnhancement(room, "home-turf");
  assertEquals(over.ok, false);
});

Deno.test(
  "hob-alarm triggers for non-owner enter",
  OPTS,
  async () => {
    const store = new MockObjectStore();
    const sheet = ctlSheet();
    const player = mockPlayer({
      id: "intruder",
      name: "Intruder",
      state: { cofd: sheet },
    });
    let hollow = defaultHedgeRoom("hollow");
    hollow = {
      ...hollow,
      hollow: {
        owners: ["owner1"],
        rating: 2,
        enhancements: ["hob-alarm"],
      },
    };
    const room = mockPlayer({
      id: "hollow1",
      name: "Secret Hollow",
      flags: new Set(["room"]),
      state: { hedge: hollow },
    });
    store.put(player);
    store.put(room);

    const u = mockU({ me: player, objectStore: store });
    await checkHobAlarmOnEnter(u, "hollow1", "intruder");

    assert(
      u._sent.some((m) => m.includes("Hob Alarm")),
    );
    const updated = store.get("intruder")!;
    const next = updated.state.cofd as ReturnType<
      typeof ctlSheet
    >;
    assert(hasCondition(next, "spooked"));
  },
);

Deno.test(
  "hob-alarm skips Hollow owners",
  OPTS,
  async () => {
    const store = new MockObjectStore();
    const player = mockPlayer({
      id: "owner1",
      name: "Owner",
      state: { cofd: ctlSheet() },
    });
    let hollow = defaultHedgeRoom("hollow");
    hollow = {
      ...hollow,
      hollow: {
        owners: ["owner1"],
        rating: 2,
        enhancements: ["hob-alarm"],
      },
    };
    store.put(player);
    store.put(mockPlayer({
      id: "hollow1",
      flags: new Set(["room"]),
      state: { hedge: hollow },
    }));

    const u = mockU({ me: player, objectStore: store });
    await checkHobAlarmOnEnter(u, "hollow1", "owner1");
    assertEquals(
      u._sent.some((m) => m.includes("Hob Alarm")),
      false,
    );
  },
);

Deno.test("key phrase normalize and match", OPTS, () => {
  assertEquals(
    normalizeKeyPhrase("  Three   Red  Leaves "),
    "three red leaves",
  );
  const way = {
    id: "w1",
    name: "Gate",
    mortalRoomId: "m",
    hedgeRoomId: "h",
    keyPhrase: "three red leaves",
    state: "closed" as const,
    createdBy: "x",
    createdAt: 0,
  };
  assert(keyPhraseMatches(way, "Three Red Leaves"));
  assert(!keyPhraseMatches(way, "wrong"));
  assert(canOpenWithKey(way, "three red leaves"));
});

Deno.test("checkPortalEnter key opens free", OPTS, () => {
  const way = {
    id: "w1",
    name: "Gate",
    mortalRoomId: "m",
    hedgeRoomId: "h",
    keyPhrase: "open sesame",
    state: "closed" as const,
    createdBy: "x",
    createdAt: 0,
  };
  const mortal = checkPortalEnter(
    null,
    way,
    "spring",
    true,
    "open sesame",
  );
  assertEquals(mortal.ok, true);
  assertEquals(mortal.glamourCost, 0);
  assertEquals(mortal.needsOpen, true);

  const bad = checkPortalEnter(null, way, "spring", true);
  assertEquals(bad.ok, false);
});

Deno.test("checkPortalEnter Lost still pays without key", OPTS, () => {
  const way = {
    id: "w1",
    name: "Gate",
    mortalRoomId: "m",
    hedgeRoomId: "h",
    keyPhrase: "secret",
    state: "closed" as const,
    createdBy: "x",
    createdAt: 0,
  };
  const c = checkPortalEnter(
    ctlSheet(),
    way,
    "spring",
    true,
  );
  assertEquals(c.ok, true);
  assertEquals(c.glamourCost, 1);
});

Deno.test("easy-access costs three hollow dots", OPTS, () => {
  let room = defaultHedgeRoom("hollow");
  room = {
    ...room,
    hollow: {
      owners: ["1"],
      rating: 3,
      enhancements: [],
    },
  };
  const r = addHollowEnhancement(room, "easy-access");
  assert(r.ok);
  assertEquals(freeHollowDots(r.room!), 0);
  assert(hollowHas(r.room!, "easy-access"));
});

// Icons + Hedgespinning pure and light command tests.

import {
  assert,
  assertEquals,
  assertStringIncludes,
} from "@std/assert";
import { defaultSheet } from "../src/stats/index.ts";
import {
  activeIcons,
  addIcon,
  findIcon,
  readIcons,
  recoverIcon,
  spendIcon,
} from "../src/icon/index.ts";
import {
  findSpinEffect,
  listSpinEffects,
  resolveSpin,
} from "../src/spin/index.ts";
import { buildNavPools } from "../src/hedge/nav_pools.ts";
import { writeFruitFlags } from "../src/hedge/fruit_inv.ts";
import { iconCommand } from "../src/commands/icon.ts";
import { spinCommand } from "../src/commands/spin.ts";
import {
  mockPlayer,
  mockU,
  MockObjectStore,
} from "./helpers/mockU.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function ctlSheet() {
  const s = defaultSheet();
  s.template = "changeling";
  s.energyCurrent = 8;
  s.powerStatValue = 2;
  s.attributes.wits = 3;
  s.skills.crafts = 2;
  s.skills.occult = 1;
  s.skills.survival = 2;
  return s;
}

Deno.test("addIcon and activeIcons", OPTS, () => {
  const r = addIcon(ctlSheet(), {
    name: "Mother's Song",
    kind: "memory",
    heldBy: "The Keeper",
    description: "Lullaby from before",
  });
  assertEquals(r.icon.status, "lost");
  assertEquals(activeIcons(r.sheet).length, 1);
  assert(findIcon(r.sheet, "Mother's Song"));
  assert(findIcon(r.sheet, r.icon.id.slice(-6)));
});

Deno.test("spendIcon grants Glamour and marks spent", OPTS, () => {
  let sheet = ctlSheet();
  sheet.energyCurrent = 5;
  const a = addIcon(sheet, {
    name: "First Laugh",
    kind: "emotion",
    heldBy: "Rival",
    description: "",
  });
  sheet = a.sheet;
  const r = spendIcon(sheet, a.icon.id, "face the gate");
  assert(r.ok);
  assertEquals(r.sheet!.energyCurrent, 7); // +2 Wyrd
  assertEquals(findIcon(r.sheet!, a.icon.id)!.status, "spent");
  assertEquals(activeIcons(r.sheet!).length, 0);
});

Deno.test(
  "spendIcon clears Clarity condition when present",
  OPTS,
  () => {
    const sheet = ctlSheet();
    sheet.conditions = [{ key: "haunted" }];
    const a = addIcon(sheet, {
      name: "Old Song",
      kind: "skill",
      heldBy: "Keeper",
      description: "",
    });
    const r = spendIcon(a.sheet, a.icon.id);
    assert(r.ok);
    assert(
      r.lines.some((l) => l.includes("Clarity Condition")),
    );
    assertEquals(
      (r.sheet!.conditions ?? []).some((c) =>
        c.key === "haunted"
      ),
      false,
    );
  },
);

Deno.test("spendIcon refuses already spent", OPTS, () => {
  let sheet = ctlSheet();
  const a = addIcon(sheet, {
    name: "X",
    kind: "other",
    heldBy: "Y",
    description: "",
  });
  sheet = spendIcon(a.sheet, a.icon.id).sheet!;
  const r = spendIcon(sheet, a.icon.id);
  assertEquals(r.ok, false);
});

Deno.test("recoverIcon marks recovered", OPTS, () => {
  const sheet = ctlSheet();
  const a = addIcon(sheet, {
    name: "Home Key",
    kind: "memory",
    heldBy: "Huntsman",
    description: "",
  });
  const r = recoverIcon(a.sheet, "Home Key");
  assert(r.ok);
  assertEquals(r.icon!.status, "recovered");
  assertEquals(r.icon!.heldBy, "Self");
});

Deno.test("spin catalog has path and fruit", OPTS, () => {
  assert(listSpinEffects().length >= 5);
  assertEquals(findSpinEffect("path")!.glamour, 1);
  assert(findSpinEffect("Coax Fruit"));
  assertEquals(findSpinEffect("path")!.kind, "subtle");
});

Deno.test("resolveSpin path on success sets flag", OPTS, () => {
  const sheet = ctlSheet();
  const r = resolveSpin(sheet, "path", {
    inHedge: true,
    successes: 3,
    now: 1_000_000,
  });
  assert(r.ok);
  assertEquals(r.sheet!.energyCurrent, 7); // 8-1
  assertEquals(r.navBonusKey, "spinPath");
  const flags = r.sheet!.hedgeState?.fruitFlags ?? [];
  assert(flags.some((f) => f.key === "spinPath"));
});

Deno.test("resolveSpin path target is 1 success", OPTS, () => {
  const r = resolveSpin(ctlSheet(), "path", {
    inHedge: true,
    successes: 1,
  });
  assert(r.ok);
});

Deno.test("resolveSpin fails under target but spends G", OPTS, () => {
  const sheet = ctlSheet();
  const r = resolveSpin(sheet, "path", {
    inHedge: true,
    successes: 0,
  });
  assertEquals(r.ok, false);
  assertEquals(r.sheet!.energyCurrent, 7);
});

Deno.test("resolveSpin refuses mortal world", OPTS, () => {
  const r = resolveSpin(ctlSheet(), "path", {
    inHedge: false,
    successes: 5,
  });
  assertEquals(r.ok, false);
  assertStringIncludes(r.reason!, "Hedge");
});

Deno.test("resolveSpin fruit returns fruitSlug", OPTS, () => {
  const r = resolveSpin(ctlSheet(), "fruit", {
    inHedge: true,
    successes: 4,
  });
  assert(r.ok);
  assertEquals(r.fruitSlug, "common-fruit");
});

Deno.test("spinPath flag boosts nav pool", OPTS, () => {
  let sheet = ctlSheet();
  sheet = writeFruitFlags(sheet, [
    { key: "spinPath", until: Date.now() + 999_999 },
  ]);
  const pools = buildNavPools(sheet, {
    room: { realm: "hedge", danger: "hedge" },
    urgency: "some",
  });
  // base wits3+surv2 = 5, +2 path = 7
  assertEquals(pools.playerPool, 7);
  assert(pools.mods.some((m) => m.includes("path")));
});

Deno.test("+icon list and spend", OPTS, async () => {
  const sheet = ctlSheet();
  const a = addIcon(sheet, {
    name: "Blue Marble",
    kind: "memory",
    heldBy: "Free",
    description: "pocket treasure",
  });
  const store = new MockObjectStore();
  const me = mockPlayer({
    id: "icon_p1",
    name: "Pix",
    state: { cofd: a.sheet },
  });
  await store.create(me);
  const u = mockU({
    me,
    args: ["", ""],
    db: store,
  });
  await iconCommand(u as never);
  assert(
    (u as { _sent: string[] })._sent.some((s) =>
      s.includes("I C O N S") || s.includes("Blue Marble")
    ),
  );

  const u2 = mockU({
    me: { ...me, state: { cofd: a.sheet } },
    args: ["spend", "Blue Marble"],
    db: store,
  });
  // re-seed store with player
  await store.create({
    ...me,
    state: { cofd: a.sheet },
  });
  await iconCommand(u2 as never);
  const out = (u2 as { _sent: string[] })._sent.join("\n");
  assertStringIncludes(out, "spend");
});

Deno.test("+spin list shows effects", OPTS, async () => {
  const me = mockPlayer({
    id: "spin_p1",
    name: "Pix",
    state: { cofd: ctlSheet() },
  });
  const u = mockU({
    me,
    args: ["list", ""],
    here: {
      id: "h1",
      name: "Thorns",
      flags: new Set(["room"]),
      state: { hedge: { realm: "hedge", danger: "hedge" } },
      location: "",
      contents: [],
    },
  });
  await spinCommand(u as never);
  const out = (u as { _sent: string[] })._sent.join("\n");
  assertStringIncludes(out, "path");
  assertStringIncludes(out, "H E D G E S P I N");
});

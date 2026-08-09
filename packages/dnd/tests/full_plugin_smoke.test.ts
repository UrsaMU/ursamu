/**
 * Full-plugin smoke — every major surface P0–P3 in one run.
 * init → cmds → catalogs → campaign → rules → combat → HTTP → remove
 */
import { assert, assertEquals } from "@std/assert";
import { walk } from "@std/fs";
import { basename, join } from "@std/path";
import { cmds } from "@ursamu/ursamu";
import { plugin } from "../index.ts";
import {
  initDndCombat,
  removeDndCombat,
  makeDndPorts,
  dndEncounterStore,
} from "../src/combat/ports.ts";
import {
  beginEncounter,
  joinEncounter,
  startEncounter,
  currentActor,
} from "@ursamu/combat";
import { defaultSheet, migrateSheet } from
  "../src/stats/dnd_sheet.ts";
import {
  addCondition,
  attackRollAdv,
} from "../src/stats/conditions.ts";
import {
  startConcentration,
  checkConcentration,
} from "../src/stats/concentration.ts";
import {
  addCoins,
  spendCoins,
  formatPurse,
} from "../src/stats/currency.ts";
import {
  setInspiration,
  maybeSpendInspiration,
  getXpRequired,
  addXp,
  setExhaustion,
} from "../src/stats/rules.ts";
import { longRest, shortRest } from "../src/stats/vitality.ts";
import {
  planLevelUp,
  applyLevelCore,
  formatLevelReady,
} from "../src/stats/levelup.ts";
import {
  classBySlug,
  npcBySlug,
  spellBySlug,
  conditionBySlug,
} from "../src/data/catalog.ts";
import { listSkins, skinBySlug } from
  "../src/adventure/skins.ts";
import { generateFromSkin } from
  "../src/adventure/generate.ts";
import { rollTreasureSlug } from
  "../src/adventure/treasure.ts";
import {
  applyAttune,
  listMagic,
  magicBySlug,
} from "../src/adventure/magic.ts";
import {
  ENCOUNTERS,
  rollTravel,
  tableForWorldKey,
} from "../src/adventure/travel.ts";
import {
  validateWorldGraph,
  WORLD,
} from "../src/world/seed.ts";
import {
  EXTRA_TOWNS,
  listCampaignTowns,
} from "../src/world/campaign.ts";
import { listRoutes, routeBySlug } from
  "../src/world/routes.ts";
import {
  bountyBySlug,
  bountyComplete,
  emptyProgress,
  listBounties,
  noteKill,
} from "../src/world/bounties.ts";
import {
  addRep,
  applyPriceDiscount,
  FACTIONS,
  readRep,
  repDiscount,
} from "../src/world/reputation.ts";
import {
  advanceLeg,
  caravanBySlug,
  caravanComplete,
  listCaravans,
  startRun,
} from "../src/world/caravans.ts";
import { rollEvent, EVENT_TABLES } from
  "../src/world/events.ts";
import {
  applyHireDiscount,
  hireDiscountFromRep,
  titleFor,
} from "../src/world/unlocks.ts";
import { routeHandler } from "../routes.ts";
import { meta } from "../src/chargen/http.ts";
import { executeDndAttack } from "../src/combat/resolve.ts";
import type { IDBObj, IUrsamuSDK } from "@ursamu/ursamu";

const OPTS = { sanitizeResources: false, sanitizeOps: false };
const HELP = join(import.meta.dirname!, "../help");

/** Every player-facing command root the plugin must register. */
const REQUIRED_CMDS = [
  "+roll", "+sheet", "+hp", "+rest", "+deathsave",
  "+cast", "+combat", "+attack", "+kill", "+loot",
  "+condition", "+inspiration", "+money", "+xp",
  "+level", "+cg", "+inventory", "+wield", "+wear",
  "+spells", "+npc", "+approve", "+deny", "+staffkit",
  "+travel", "+camp", "+party", "+magic", "+attune",
  "+unattune", "+adv", "+adventure", "+chest", "+altar",
  "+hire", "+road", "+bounty", "+rep", "+caravan",
  "+event", "+dnd/world",
];

type Obj = IDBObj & { state: Record<string, unknown> };

function makeWorld() {
  const map = new Map<string, Obj>();
  const put = (o: Obj) => {
    map.set(o.id, o);
    return o;
  };
  const db = {
    search: (q: Record<string, unknown>) => {
      if (q.id) {
        const o = map.get(String(q.id));
        return Promise.resolve(o ? [o] : []);
      }
      if (q.location) {
        return Promise.resolve(
          [...map.values()].filter(
            (o) => o.location === q.location,
          ),
        );
      }
      return Promise.resolve([...map.values()]);
    },
    modify: (
      id: string,
      _op: string,
      data: Record<string, unknown>,
    ) => {
      const o = map.get(id);
      if (!o) return Promise.resolve();
      for (const [k, v] of Object.entries(data)) {
        if (k === "data.dnd") {
          o.state = { ...o.state, dnd: v };
        } else if (k === "location") {
          o.location = String(v);
        }
      }
      return Promise.resolve();
    },
    create: (tmpl: Partial<Obj>) => {
      const id = `obj-${map.size + 1}`;
      const o = {
        id,
        name: tmpl.name ?? id,
        flags: tmpl.flags ?? new Set(["thing"]),
        location: tmpl.location ?? "",
        contents: [],
        state: tmpl.state ?? {},
      } as Obj;
      map.set(id, o);
      return Promise.resolve(o);
    },
    destroy: (id: string) => {
      map.delete(id);
      return Promise.resolve();
    },
  };
  return { map, put, db };
}

function mockU(
  w: ReturnType<typeof makeWorld>,
  meId: string,
): IUrsamuSDK & { _msgs: string[] } {
  const msgs: string[] = [];
  const me = w.map.get(meId)!;
  return {
    me,
    here: {
      id: "room-smoke",
      broadcast: (m: string) => {
        msgs.push(m);
      },
    },
    cmd: { name: "", original: "", args: [], switches: [] },
    db: w.db,
    send: (m: string) => {
      msgs.push(m);
    },
    broadcast: (m: string) => {
      msgs.push(m);
    },
    canEdit: async () => true,
    util: {
      stripSubs: (s: string) =>
        s.replace(/%c[a-z]/gi, "").replace(/%[rntb]/gi, ""),
      displayName: (o: { name?: string }) =>
        (o.name ?? "?").split(";")[0],
      ljust: (s: string, n: number) => s.padEnd(n),
      rjust: (s: string, n: number) => s.padStart(n),
      center: (s: string) => s,
      target: async () => null,
    },
    _msgs: msgs,
  } as unknown as IUrsamuSDK & { _msgs: string[] };
}

Deno.test("FULL PLUGIN SMOKE P0–P3", OPTS, async () => {
  // ── 1. Lifecycle ──────────────────────────────────────
  removeDndCombat();
  assertEquals(plugin.init(), true);
  assertEquals(plugin.name, "dnd");

  // ── 2. Command registration ───────────────────────────
  const names = cmds.map((c) => c.name);
  const missing: string[] = [];
  for (const n of REQUIRED_CMDS) {
    const ok = names.some(
      (x) => x === n || x.startsWith(n + "/") || x.startsWith(n),
    );
    if (!ok) missing.push(n);
  }
  assertEquals(
    missing,
    [],
    `missing cmds: ${missing.join(", ")}`,
  );

  // ── 3. SRD catalogs ───────────────────────────────────
  assert(classBySlug("fighter"));
  assert(classBySlug("wizard"));
  assert(npcBySlug("goblin"));
  assert(npcBySlug("ogre"));
  assert(conditionBySlug("prone"));
  assert(spellBySlug("cure_wounds")?.healing);
  assert(spellBySlug("fireball") || spellBySlug("magic_missile"));

  // ── 4. Adventure skins + generator ────────────────────
  assert(listSkins().length >= 7);
  assert(skinBySlug("goblin-warren"));
  assert(skinBySlug("haunted-keep")?.tier === 3);
  const gen = generateFromSkin(
    skinBySlug("goblin-warren")!,
    "smoke-run",
    { partySize: 2, rng: () => 0.4 },
  );
  assert(gen.rooms.some((r) => r.key === "boss"));
  assert(gen.mobs.length >= 1);
  const loot = rollTreasureSlug("boss-stash", () => 0)!;
  assert(loot && (loot.gp > 0 || loot.items.length > 0));

  // ── 5. Magic + attune ─────────────────────────────────
  assert(listMagic().length >= 6);
  assert(magicBySlug("cloak_of_protection"));
  let sheet = defaultSheet();
  sheet.ac = 14;
  const att = applyAttune(sheet, "cloak_of_protection");
  assert(att.ok);
  assertEquals(att.sheet.ac, 15);

  // ── 6. Travel / encounters ────────────────────────────
  assert(ENCOUNTERS.whisperwood);
  assert(ENCOUNTERS.hills);
  assertEquals(tableForWorldKey("path")?.slug, "whisperwood");
  const quiet = rollTravel(
    ENCOUNTERS.whisperwood!,
    1,
    () => 0.99,
  );
  assertEquals(quiet.kind, "nothing");

  // ── 7. Multi-town campaign ────────────────────────────
  assertEquals(validateWorldGraph(WORLD), []);
  assert(listCampaignTowns().length >= 3);
  assert(EXTRA_TOWNS.some((t) => t.id === "millhaven-v1"));
  assert(EXTRA_TOWNS.some((t) => t.id === "ashford-v1"));
  for (const t of EXTRA_TOWNS) {
    assertEquals(
      validateWorldGraph(t),
      [],
      t.id,
    );
  }
  assert(routeBySlug("haven-mill"));
  assert(routeBySlug("haven-ash")?.encounter === "hills");
  assert(listRoutes().length >= 2);

  // ── 8. Bounties + rep ─────────────────────────────────
  assert(listBounties().length >= 5);
  assert(listBounties("ashford").length >= 1);
  const bdef = bountyBySlug("goblin-raid")!;
  let prog = emptyProgress(bdef.slug);
  prog = noteKill(prog, "goblin");
  prog = noteKill(prog, "goblin");
  prog = noteKill(prog, "goblin");
  assert(bountyComplete(bdef, prog));
  assert(FACTIONS.havenbrook && FACTIONS.ashford);
  let rep = readRep({});
  rep = addRep(rep, "havenbrook", 12);
  assertEquals(repDiscount(12), 0.1);
  assertEquals(applyPriceDiscount(100, 12), 90);
  assertEquals(titleFor("havenbrook", 10), "Trusted Blade");
  assertEquals(hireDiscountFromRep(rep), 0.1);
  assertEquals(applyHireDiscount(25, rep), 22);

  // ── 9. Caravans + events ────────────────────────────
  assert(listCaravans().length >= 3);
  const cdef = caravanBySlug("flour-run")!;
  let run = startRun(cdef.slug);
  run = advanceLeg(run);
  run = advanceLeg(run);
  assert(caravanComplete(cdef, run));
  assert(EVENT_TABLES.town && EVENT_TABLES.road);
  const ev = rollEvent("town", 1, () => 0.01);
  assert(ev && ev.text.length > 0);

  // ── 10. Core rules math ───────────────────────────────
  sheet = defaultSheet();
  sheet = addCondition(sheet, "poisoned").sheet;
  assertEquals(attackRollAdv(sheet, defaultSheet()), "disadvantage");
  sheet = setInspiration(defaultSheet(), true);
  assertEquals(
    maybeSpendInspiration(sheet, true, "normal").spent,
    true,
  );
  sheet = startConcentration(defaultSheet(), "bless");
  assertEquals(
    checkConcentration(sheet, 4, () => 0.99).broke,
    false,
  );
  sheet = addCoins(defaultSheet(), 10, "sp");
  assert(formatPurse(sheet).includes("sp"));
  assert(spendCoins(sheet, 1000, "gp") === null);
  assertEquals(getXpRequired(2), 300);
  sheet = addXp(defaultSheet(), 300);
  sheet.level = 1;
  sheet.classes = { Fighter: 1 };
  const plan = planLevelUp(sheet, "fighter");
  assert(!("error" in plan));
  assertEquals(plan.canLevel, true);
  const bumped = applyLevelCore(sheet, plan);
  assertEquals(bumped.level, 2);
  void formatLevelReady(bumped);

  const dying = defaultSheet();
  dying.hp.current = 1;
  dying.exhaustion = 2;
  const lr = longRest(setExhaustion(dying, 2));
  assert(lr.ok);
  assertEquals(lr.sheet.exhaustion, 1);
  const sr = shortRest(defaultSheet(), 1, () => 0.5);
  assert(sr.ok);

  // ── 11. Combat ports + walker ─────────────────────────
  removeDndCombat();
  initDndCombat();
  const w = makeWorld();
  const pSheet = defaultSheet();
  pSheet.class = "Fighter";
  pSheet.hp = { max: 20, current: 20, temp: 0 };
  pSheet.abilities.strength = 16;
  const nSheet = defaultSheet();
  nSheet.class = "Monster";
  nSheet.hp = { max: 10, current: 10, temp: 0 };
  // deno-lint-ignore no-explicit-any
  (nSheet as any).aiKey = "aggressive";
  w.put({
    id: "pc1",
    name: "SmokePC",
    flags: new Set(["player", "connected"]),
    location: "room-smoke",
    contents: [],
    state: { name: "SmokePC", dnd: pSheet },
  } as Obj);
  w.put({
    id: "npc1",
    name: "SmokeFoe",
    flags: new Set(["npc", "thing"]),
    location: "room-smoke",
    contents: [],
    state: { name: "SmokeFoe", dnd: nSheet },
  } as Obj);
  const u = mockU(w, "pc1");
  const ports = makeDndPorts(u);
  let enc = await startEncounter("room-smoke", {
    store: dndEncounterStore,
  });
  enc = (await joinEncounter(enc.id, {
    actorId: "pc1",
    name: "SmokePC",
    kind: "pc",
  }, { store: dndEncounterStore, ports }))!;
  enc = (await joinEncounter(enc.id, {
    actorId: "npc1",
    name: "SmokeFoe",
    kind: "npc",
  }, { store: dndEncounterStore, ports }))!;
  enc = (await beginEncounter(enc.id, {
    store: dndEncounterStore,
    ports,
  }))!;
  assertEquals(enc.status, "active");
  assert(currentActor(enc));
  const hero = w.map.get("pc1")!;
  const foe = w.map.get("npc1")!;
  const slot = enc.participants.find((x) => x.actorId === "npc1")!;
  const atk = await executeDndAttack(u, hero, foe, slot);
  assert(typeof atk.hit === "boolean");
  assert(atk.message.length > 0);
  removeDndCombat();

  // ── 12. HTTP routes ───────────────────────────────────
  const m = meta();
  assert(m && typeof m === "object");
  const pub = await routeHandler(
    new Request("http://x/api/v1/dnd/meta"),
    null,
  );
  assertEquals(pub.status, 200);
  const noAuth = await routeHandler(
    new Request("http://x/api/v1/dnd/sheet"),
    null,
  );
  assertEquals(noAuth.status, 401);

  // ── 13. Help files ────────────────────────────────────
  const topics = new Set<string>();
  for await (
    const e of walk(HELP, { exts: [".md"], maxDepth: 1 })
  ) {
    if (!e.isFile) continue;
    topics.add(basename(e.path, ".md"));
    const text = await Deno.readTextFile(e.path);
    const lines = text.replace(/\n$/, "").split("\n");
    assert(
      lines.length <= 22,
      `${e.name}: ${lines.length} lines`,
    );
    for (const line of lines) {
      assert(line.length <= 78, `${e.name} wide line`);
    }
  }
  for (
    const t of [
      "dnd", "adventure", "combat", "travel", "road",
      "bounty", "caravan", "event", "rep", "magic",
      "camp", "party", "world", "staffkit", "hire",
    ]
  ) {
    assert(topics.has(t), `missing help/${t}.md`);
  }

  // ── 14. Teardown ──────────────────────────────────────
  plugin.remove();
  assert(true);
});

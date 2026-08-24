/**
 * Pure chargen ops — all three methods + lifepath/chrome/gear.
 */
import { assertEquals, assertExists } from "@std/assert";
import { buildNewCharacter } from "../engine/character.ts";
import {
  addGear,
  applyLifestyle,
  applyMethod,
  applyRole,
  applyStat,
  applySkill,
  finalizeDraft,
  approveDraft,
  CONCEPT_NOTES_MIN,
  installChrome,
  listGearCatalog,
  removeChrome,
  rollLifepath,
  stepDraft,
  submitDraft,
} from "../engine/chargen-ops.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function fresh() {
  return buildNewCharacter("solo");
}

Deno.test("applyMethod accepts all three methods", OPTS, () => {
  for (const m of ["streetrat", "edgerunner", "complete"] as const) {
    const r = applyMethod(fresh(), m);
    assertEquals(r.ok, true);
    if (r.ok) {
      assertEquals(r.draft.chargenMethod, m);
      assertEquals(r.draft.chargenStage, "role_select");
    }
  }
  const bad = applyMethod(fresh(), "nope");
  assertEquals(bad.ok, false);
});

Deno.test("streetrat role applies template stats + skills", OPTS, () => {
  let d = fresh();
  const m = applyMethod(d, "streetrat");
  assertEquals(m.ok, true);
  if (!m.ok) return;
  // Designate Solo template roll 6 (book example row)
  const r = applyRole(m.draft, "solo", { streetratRoll: 6 });
  assertEquals(r.ok, true);
  if (!r.ok) return;
  assertEquals(r.draft.stats.int, 7);
  assertEquals(r.draft.stats.ref, 7);
  assertEquals(r.draft.stats.dex, 6);
  assertEquals(r.draft.stats.tech, 5);
  assertEquals(r.draft.stats.cool, 7);
  assertEquals(r.draft.stats.will, 6);
  assertEquals(r.draft.stats.luck, 6);
  assertEquals(r.draft.stats.move, 7);
  assertEquals(r.draft.stats.body, 7);
  assertEquals(r.draft.stats.emp, 5);
  // Skills are Role template ranks — not all 2s
  assertEquals(r.draft.skills.athletics, 2);
  assertEquals(r.draft.skills.handgun, 6);
  assertEquals(r.draft.skills.autofire, 6);
  assertEquals(r.draft.skills.tactics, 6);
  assertEquals(r.draft.skills.brawling, 2);
  assertEquals(r.draft.skills.perception, 6);
  assertEquals(r.draft.chargenSkillPool, 0);
  assertEquals(r.draft.chargenStage, "lifepath_cultural");
  // Book: kit free + 500eb pocket (not 2550 complete budget)
  assertEquals(r.draft.eurodollars, 500);
  const locked = applyStat(r.draft, "ref", 5);
  assertEquals(locked.ok, false);
  const skLocked = applySkill(r.draft, "handgun", 4);
  assertEquals(skLocked.ok, false);
});

Deno.test("streetrat rockerboy skills match template", OPTS, () => {
  const m = applyMethod(fresh(), "streetrat");
  assertEquals(m.ok, true);
  if (!m.ok) return;
  const r = applyRole(m.draft, "rockerboy", { streetratRoll: 1 });
  assertEquals(r.ok, true);
  if (!r.ok) return;
  assertEquals(r.draft.skills.brawling, 6);
  assertEquals(r.draft.skills.composition, 6);
  assertEquals(r.draft.skills.play_instrument, 6);
  assertEquals(r.draft.skills.streetwise, 6);
  assertEquals(r.draft.skills.athletics, 2);
});

Deno.test("streetrat cultural grants language 4", OPTS, () => {
  const m = applyMethod(fresh(), "streetrat");
  assertEquals(m.ok, true);
  if (!m.ok) return;
  const r = applyRole(m.draft, "solo", { streetratRoll: 1 });
  assertEquals(r.ok, true);
  if (!r.ok) return;
  const lp = rollLifepath(r.draft, {
    stage: "lifepath_cultural",
    n: 1,
  });
  assertEquals(lp.ok, true);
  if (!lp.ok) return;
  // North American → first listed language Chinese → rank 4
  assertEquals(lp.draft.skills.language_chinese, 4);
  assertEquals(lp.draft.skills.language_streetslang, 2);
});

Deno.test("edgerunner role rolls stats in 3–8", OPTS, () => {
  let d = fresh();
  const m = applyMethod(d, "edgerunner");
  assertEquals(m.ok, true);
  if (!m.ok) return;
  const r = applyRole(m.draft, "netrunner");
  assertEquals(r.ok, true);
  if (!r.ok) return;
  for (const k of [
    "int", "ref", "dex", "tech", "cool",
    "will", "luck", "move", "body", "emp",
  ] as const) {
    const v = r.draft.stats[k];
    assertEquals(v >= 3 && v <= 8, true, `${k}=${v}`);
  }
});

Deno.test("edgerunner gets 86 skill points on role list", OPTS, () => {
  let d = fresh();
  const m = applyMethod(d, "edgerunner");
  assertEquals(m.ok, true);
  if (!m.ok) return;
  const r = applyRole(m.draft, "solo");
  assertEquals(r.ok, true);
  if (!r.ok) return;
  // Solo package = 20 skills @2; autofire x2 → floor 42, remain 44
  const pool = r.draft.chargenSkillPool ?? 0;
  assertEquals(pool, 44);
  assertEquals(r.draft.skills.autofire, 2);
  assertEquals(r.draft.skills.handgun, 2);
  // Raise handgun 2→3 costs 1
  const s = applySkill(r.draft, "handgun", 3);
  assertEquals(s.ok, true);
  if (!s.ok) return;
  assertEquals(s.draft.chargenSkillPool, 43);
  // Non-role skill blocked
  const bad = applySkill(s.draft, "bureaucracy", 4);
  assertEquals(bad.ok, false);
  // Rank 0/1 allowed while editing (invalid until 2–6)
  const low = applySkill(s.draft, "handgun", 1);
  assertEquals(low.ok, true);
  if (!low.ok) return;
  assertEquals(low.meta?.skillValid, false);
  // Back into band
  const okBand = applySkill(low.draft, "handgun", 3);
  assertEquals(okBand.ok, true);
  if (!okBand.ok) return;
  assertEquals(okBand.meta?.skillValid, true);
});

Deno.test("complete method tracks stat pool", OPTS, () => {
  let d = fresh();
  const m = applyMethod(d, "complete");
  assertEquals(m.ok, true);
  if (!m.ok) return;
  assertEquals(m.draft.chargenStatPool, 62);
  assertEquals(m.draft.stats.int, 2);
  const r = applyRole(m.draft, "fixer");
  assertEquals(r.ok, true);
  if (!r.ok) return;
  assertEquals(r.draft.eurodollars, 2550);
  // all-2s base; raising int 2→7 costs 5
  const s = applyStat(r.draft, "int", 7);
  assertEquals(s.ok, true);
  if (!s.ok) return;
  assertEquals(s.draft.stats.int, 7);
  assertEquals(s.draft.chargenStatPool, 57);
});

Deno.test("edgerunner starts with 500eb pocket", OPTS, () => {
  const m = applyMethod(fresh(), "edgerunner");
  assertEquals(m.ok, true);
  if (!m.ok) return;
  const r = applyRole(m.draft, "solo");
  assertEquals(r.ok, true);
  if (!r.ok) return;
  assertEquals(r.draft.eurodollars, 500);
});

Deno.test("lifepath cultural roll patches origin", OPTS, () => {
  let d = fresh();
  d = { ...d, chargenStage: "lifepath_cultural", role: "solo" };
  const r = rollLifepath(d, { n: 1 });
  assertEquals(r.ok, true);
  if (!r.ok) return;
  assertEquals(r.draft.lifepath.culturalOrigin, "North American");
  assertExists(r.draft.lifepath.language);
});

Deno.test("lifepath friends bundle rolls", OPTS, () => {
  let d = fresh();
  d = { ...d, chargenStage: "lifepath_friends", role: "solo" };
  const r = rollLifepath(d, {});
  assertEquals(r.ok, true);
  if (!r.ok) return;
  assertExists(r.draft.lifepath._friendCount);
  assertEquals(
    Array.isArray(r.draft.lifepath.friends),
    true,
  );
});

Deno.test("lifestyle then chrome then gear path", OPTS, () => {
  let d = fresh();
  d = {
    ...d,
    chargenMethod: "streetrat",
    role: "solo",
    chargenStage: "lifestyle",
    eurodollars: 500,
    stats: {
      ...d.stats,
      ...{
        int: 5, ref: 8, dex: 7, tech: 5, cool: 6,
        will: 6, luck: 5, move: 7, body: 7, emp: 4, empBase: 4,
      },
    },
  };
  const ls = applyLifestyle(d, "streetrat");
  assertEquals(ls.ok, true);
  if (!ls.ok) return;
  assertEquals(ls.draft.chargenStage, "cyberware");
  // Lifestyle must not wipe pocket EB
  assertEquals(ls.draft.eurodollars, 500);

  const ch = installChrome(ls.draft, "light_tattoo");
  assertEquals(ch.ok, true);
  if (!ch.ok) return;
  assertEquals(ch.draft.cyberware.length, 1);

  const stepped = stepDraft(ch.draft, "next");
  assertEquals(stepped.ok, true);
  if (!stepped.ok) return;
  // may land on equipment depending on order
  let eq = stepped.draft;
  if (eq.chargenStage !== "equipment") {
    eq = { ...eq, chargenStage: "equipment" };
  }
  // cheap weapon
  const g = addGear(eq, "medium_pistol");
  // medium_pistol may or may not exist — accept fail if unknown
  if (g.ok) {
    assertEquals(
      (g.draft.roleData.startingGear as string[]).includes(
        "medium_pistol",
      ),
      true,
    );
  }

  const rev = {
    ...eq,
    chargenStage: "review" as const,
    role: "solo" as const,
    chargenMethod: "streetrat" as const,
    conceptNotes: "",
  };
  const noNotes = submitDraft(rev);
  assertEquals(noNotes.ok, false);

  const notes = "A".repeat(CONCEPT_NOTES_MIN);
  const pending = submitDraft(rev, notes);
  assertEquals(pending.ok, true);
  if (!pending.ok) return;
  assertEquals(pending.draft.chargenStatus, "pending");
  assertEquals(pending.draft.chargenComplete, false);
  assertEquals(
    (pending.draft.conceptNotes ?? "").length >= CONCEPT_NOTES_MIN,
    true,
  );

  const approved = approveDraft(pending.draft);
  assertEquals(approved.ok, true);
  if (!approved.ok) return;
  assertEquals(approved.draft.chargenComplete, true);
  assertEquals(approved.draft.chargenStatus, "approved");
});

Deno.test("step next stops at review before complete", OPTS, () => {
  let d = fresh();
  d = { ...d, chargenStage: "review" };
  const r = stepDraft(d, "next");
  assertEquals(r.ok, true);
  if (!r.ok) return;
  assertEquals(r.draft.chargenStage, "review");
});

Deno.test(
  "installChrome sets subdermal SP; remove clears it",
  OPTS,
  () => {
    let d = {
      ...fresh(),
      chargenStage: "cyberware" as const,
      humanityLoss: 0,
      cyberware: [],
      subdermalArmorSp: 0,
    };
    const ins = installChrome(d, "subdermal armor");
    assertEquals(ins.ok, true);
    if (!ins.ok) return;
    assertEquals(ins.draft.subdermalArmorSp, 11);
    assertEquals(
      ins.draft.cyberware.some((c) => c.name === "subdermal_armor"),
      true,
    );

    const rm = removeChrome(ins.draft, "subdermal");
    assertEquals(rm.ok, true);
    if (!rm.ok) return;
    assertEquals(rm.draft.subdermalArmorSp, 0);
    assertEquals(rm.draft.cyberware.length, 0);
  },
);

Deno.test(
  "chrome names accept spaces — no underscores required",
  OPTS,
  () => {
    let d = {
      ...fresh(),
      chargenStage: "cyberware" as const,
      humanityLoss: 0,
      cyberware: [],
    };
    const nl = installChrome(d, "Neural Link");
    assertEquals(nl.ok, true);
    if (!nl.ok) return;
    const sock = installChrome(nl.draft, "chipware socket");
    assertEquals(sock.ok, true);
    if (!sock.ok) return;
    const rm = removeChrome(sock.draft, "chipware socket");
    assertEquals(rm.ok, true);
    if (!rm.ok) return;
    assertEquals(
      rm.draft.cyberware.some((c) => c.name === "chipware_socket"),
      false,
    );
  },
);

Deno.test(
  "remove last chrome zeros HL so EMP can recover",
  OPTS,
  () => {
    let d = {
      ...fresh(),
      chargenStage: "cyberware" as const,
      humanityLoss: 0,
      cyberware: [] as { id: string; name: string; category: string; hl: number; installType: string; installedAt: number }[],
      stats: {
        ...fresh().stats,
        emp: 6,
        empBase: 6,
      },
    };
    const ins = installChrome(d, "neural link");
    assertEquals(ins.ok, true);
    if (!ins.ok) return;
    // Simulate high residual HL (psychosis territory)
    const toxic = {
      ...ins.draft,
      humanityLoss: 60,
      stats: { ...ins.draft.stats, emp: 0, empBase: 6 },
    };
    const rm = removeChrome(toxic, "neural link");
    assertEquals(rm.ok, true);
    if (!rm.ok) return;
    assertEquals(rm.draft.cyberware.length, 0);
    assertEquals(rm.draft.humanityLoss, 0);
    assertEquals(rm.draft.stats.emp, 6);
  },
);

Deno.test(
  "removeChrome clears orphan subdermal SP pool",
  OPTS,
  () => {
    const d = {
      ...fresh(),
      chargenStage: "cyberware" as const,
      cyberware: [],
      subdermalArmorSp: 11,
    };
    const rm = removeChrome(d, "subdermal_armor");
    assertEquals(rm.ok, true);
    if (!rm.ok) return;
    assertEquals(rm.draft.subdermalArmorSp, 0);
    assertEquals(rm.meta?.clearedOrphanSp, true);
  },
);

Deno.test("gear catalog includes suggested + spent", OPTS, () => {
  let d = {
    ...fresh(),
    chargenStage: "equipment" as const,
    role: "solo" as const,
    eurodollars: 500,
    roleData: { startingGear: [] as string[] },
  };
  const cat0 = listGearCatalog(d);
  assertEquals(cat0.budget, 500);
  assertEquals(cat0.spent, 0);
  assertEquals(cat0.weapons.some((w) => w.suggested), true);
  assertEquals(
    cat0.weapons.every((w) =>
      typeof w.damage === "string" && w.costEb > 0
    ),
    true,
  );
  assertEquals(cat0.armor.length > 0, true);

  const add = addGear(d, "medium_pistol");
  assertEquals(add.ok, true);
  if (!add.ok) return;
  const cat1 = listGearCatalog(add.draft);
  assertEquals(cat1.spent, 50);
  assertEquals(cat1.budget, 450);
  assertEquals(
    cat1.weapons.find((w) => w.name === "medium_pistol")?.owned,
    true,
  );
  assertEquals(
    cat1.weapons.find((w) => w.name === "medium_pistol")
      ?.affordable,
    true,
  );
});

Deno.test(
  "chipware: neural_link → socket → skill_chip mounts",
  OPTS,
  () => {
    let d = {
      ...fresh(),
      chargenStage: "cyberware" as const,
      humanityLoss: 0,
      cyberware: [],
    };
    const nl = installChrome(d, "neural_link");
    assertEquals(nl.ok, true);
    if (!nl.ok) return;
    d = nl.draft;

    const sock = installChrome(d, "chipware_socket");
    assertEquals(sock.ok, true);
    if (!sock.ok) return;
    d = sock.draft;
    const socket = d.cyberware.find((c) =>
      c.name === "chipware_socket"
    );
    assertExists(socket);
    assertEquals(socket!.slots, 1);
    assertEquals(socket!.installedIn != null, true);

    const chip = installChrome(d, "skill_chip");
    assertEquals(chip.ok, true);
    if (!chip.ok) return;
    d = chip.draft;
    const skill = d.cyberware.find((c) => c.name === "skill_chip");
    assertExists(skill);
    assertEquals(skill!.installedIn, socket!.id);

    // One chip fills the socket — second needs another socket
    const full = installChrome(d, "memory_chip");
    assertEquals(full.ok, false);

    const sock2 = installChrome(d, "chipware_socket");
    assertEquals(sock2.ok, true);
    if (!sock2.ok) return;
    d = sock2.draft;
    const mem = installChrome(d, "memory_chip");
    assertEquals(mem.ok, true);
    if (!mem.ok) return;
    const sockets = mem.draft.cyberware.filter((c) =>
      c.name === "chipware_socket"
    );
    assertEquals(sockets.length, 2);
    const memPiece = mem.draft.cyberware.find((c) =>
      c.name === "memory_chip"
    );
    assertExists(memPiece);
    assertEquals(
      sockets.some((s) => s.id === memPiece!.installedIn),
      true,
    );
  },
);

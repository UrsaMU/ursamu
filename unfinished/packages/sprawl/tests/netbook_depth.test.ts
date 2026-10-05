import { assertEquals, assert } from "@std/assert";
import { defaultChar } from "../db/schemas.ts";
import {
  consoleSpec,
  equipConsole,
  installSoftware,
  softwareHackBonus,
} from "../engine/net.ts";
import {
  applyHyperionGlitch,
  consoleDestroyDs,
  hullSlotBonus,
} from "../engine/hull-specials.ts";
import {
  packIntoDemon,
  rollSoftwareObsolescence,
  usedSlotsWithPacks,
} from "../engine/software-life.ts";
import {
  startAiFight,
  strikeParadox,
} from "../engine/net-ai.ts";
import { maybeLootOnHack } from "../engine/company-loot.ts";
import {
  defendConsole,
  useNetHardware,
} from "../engine/net-hardware.ts";
import { freeSoftwareSlots } from "../engine/net.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function deck(slug = "hyperion") {
  let c = defaultChar("N");
  c = {
    ...c,
    bityuan: 20000,
    stats: { ...c.stats, cognition: 4 },
  };
  c = equipConsole(c, slug) as typeof c;
  return c;
}

Deno.test("Hyperion cancels glitch on 2nd action", OPTS, () => {
  let c = deck("hyperion");
  const spec = consoleSpec(c)!;
  const a = applyHyperionGlitch(c, spec, 2);
  assertEquals(a.glitch, 2);
  c = a.next;
  const b = applyHyperionGlitch(c, spec, 2);
  assertEquals(b.glitch, 1);
});

Deno.test("Vision high-storage extra slots", OPTS, () => {
  const c = deck("vision-512e");
  const spec = consoleSpec(c)!;
  assertEquals(hullSlotBonus(spec), 2);
  assertEquals(freeSoftwareSlots(c), spec.slots + 2);
});

Deno.test("Shinobi destroy DS 18", OPTS, () => {
  const c = deck("shinobi-7");
  assertEquals(consoleDestroyDs(consoleSpec(c)!), 18);
});

Deno.test("demon pack frees outer slots", OPTS, () => {
  let c = deck("hyperion");
  for (const s of ["demon-i", "hunter", "cloak"]) {
    const r = installSoftware(c, s);
    assert(!("error" in r), String((r as { error: string }).error));
    c = r;
  }
  const before = usedSlotsWithPacks(c);
  const p = packIntoDemon(c, "demon-i", ["hunter", "cloak"]);
  assert(!("error" in p));
  c = p;
  assert(usedSlotsWithPacks(c) < before);
});

Deno.test("obsolescence can kill software bonus", OPTS, () => {
  let c = deck();
  c = installSoftware(c, "tunnel-rat") as typeof c;
  // force obsolete
  c = { ...c, softwareObsolete: ["tunnel-rat"] };
  const b = softwareHackBonus(c, "find");
  assertEquals(b.bonus, 0);
  const roll = rollSoftwareObsolescence(c, () => 0); // d6=1
  // already obsolete, no new
  assertEquals(roll.died.length, 0);
});

Deno.test("obsolescence rolls 1 kills soft", OPTS, () => {
  let c = deck();
  c = installSoftware(c, "hunter") as typeof c;
  const roll = rollSoftwareObsolescence(c, () => 0);
  assert(roll.died.includes("hunter"));
  assert(roll.next.softwareObsolete?.includes("hunter"));
});

Deno.test("AI paradox correct type wins path", OPTS, () => {
  let c = deck();
  const st = startAiFight(c, "architect", () => 0.5);
  assert(st.ok);
  if (!st.ok) return;
  c = st.next;
  // force low AI ds for win
  c = {
    ...c,
    net: {
      ...c.net,
      aiFight: {
        slug: "architect",
        name: "Architect",
        ds: 10,
        dsMax: 20,
      },
    },
    stats: { ...c.stats, cognition: 6 },
  };
  const hit = strikeParadox(c, "eschatology", () => 0.99);
  assert(hit.ok);
  if (!hit.ok) return;
  assert(hit.notes.some((n) => /matched|grasp|reeling/i.test(n)));
});

Deno.test("company loot on find success", OPTS, () => {
  let c = deck();
  const r = maybeLootOnHack(c, {
    success: true,
    exploitSlug: "find",
    rng: () => 0.5,
  });
  assert(r.notes.some((n) => n.includes("DATA")));
  assert((r.next.net?.companyLoot?.length ?? 0) >= 1);
});

Deno.test("firewall defend holds", OPTS, () => {
  const c = deck("hyperion"); // FW 14
  const r = defendConsole(c, 10);
  assert(r.held);
});

Deno.test("flipper hardware applies DS penalty", OPTS, () => {
  let c = deck();
  const r = useNetHardware(c, "flipper-zero");
  assert(r.ok);
  if (!r.ok) return;
  assertEquals(r.next.net?.softDsPenalty, 1);
});

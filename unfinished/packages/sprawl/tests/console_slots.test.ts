import { assertEquals, assert } from "@std/assert";
import { defaultChar } from "../db/schemas.ts";
import {
  consoleSpec,
  equipConsole,
  hasSoftware,
  installSoftware,
  removeSoftware,
  softwareHackBonus,
  usedSoftwareSlots,
} from "../engine/net.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("load requires equipped console", OPTS, () => {
  const c = defaultChar("Neon");
  const r = installSoftware(c, "tunnel-rat");
  assert("error" in r);
  assert(String(r.error).includes("equip"));
});

Deno.test("hyperion loads up to 6 slots", OPTS, () => {
  let c = defaultChar("Neon");
  const eq = equipConsole(c, "hyperion");
  assert(!("error" in eq));
  c = eq;
  const spec = consoleSpec(c)!;
  assertEquals(spec.ram, 3);
  assertEquals(spec.slots, 6);
  assertEquals(spec.firewall, 14);
  assertEquals(spec.bonus, 1);

  const pack = [
    "tunnel-rat",
    "hunter",
    "cloak",
    "peripheral",
    "hydra",
    "drill-plus",
  ];
  for (const s of pack) {
    const r = installSoftware(c, s);
    assert(!("error" in r), String((r as { error: string }).error));
    c = r;
  }
  assertEquals(usedSoftwareSlots(c), 6);
  const full = installSoftware(c, "jammer");
  assert("error" in full);
  assert(String(full.error).includes("full"));
});

Deno.test("nPod blocks illicit software", OPTS, () => {
  let c = defaultChar("Neon");
  const eq = equipConsole(c, "npod");
  assert(!("error" in eq));
  c = eq;
  const r = installSoftware(c, "tunnel-rat");
  assert("error" in r);
  assert(String(r.error).toLowerCase().includes("illicit"));
});

Deno.test("gestalt slots equal Cognition; needs jack", OPTS, () => {
  let c = defaultChar("Neon");
  c = {
    ...c,
    stats: { ...c.stats, cognition: 4 },
  };
  const eq = equipConsole(c, "gestalt");
  assert(!("error" in eq));
  c = eq;
  assertEquals(consoleSpec(c)!.slots, 4);
  const noJack = installSoftware(c, "hunter");
  assert("error" in noJack);
  assert(String(noJack.error).includes("Savvy Jack"));

  c = {
    ...c,
    augs: [{ slug: "savvy-jack", name: "Savvy Jack" }],
  };
  const ok = installSoftware(c, "hunter");
  assert(!("error" in ok));
  assert(hasSoftware(ok, "hunter"));
});

Deno.test("equip smaller hull rejects overflow soft", OPTS, () => {
  let c = defaultChar("Neon");
  c = equipConsole(c, "vision-512e") as typeof c;
  // 8-slot hull — fill 4
  for (const s of ["tunnel-rat", "hunter", "cloak", "hydra"]) {
    const r = installSoftware(c, s);
    assert(!("error" in r));
    c = r;
  }
  // n-24a only has 3 slots
  const bad = equipConsole(c, "n-24a");
  assert("error" in bad);
  assert(String(bad.error).includes("slots"));
});

Deno.test("unload frees slots", OPTS, () => {
  let c = defaultChar("Neon");
  c = equipConsole(c, "nimbus") as typeof c; // 5 slots
  c = installSoftware(c, "tunnel-rat") as typeof c;
  assertEquals(usedSoftwareSlots(c), 1);
  const rm = removeSoftware(c, "tunnel-rat");
  assert(!("error" in rm));
  assertEquals(usedSoftwareSlots(rm), 0);
});

Deno.test("console bonus from hull on hack parts", OPTS, () => {
  let c = defaultChar("Neon");
  c = equipConsole(c, "n-24a") as typeof c;
  assertEquals(consoleSpec(c)!.bonus, 2);
  c = installSoftware(c, "tunnel-rat") as typeof c;
  // n-24a blocks? no — n-24a does not have blocks-illicit
  const b = softwareHackBonus(c, "find");
  assert(b.bonus >= 1);
});

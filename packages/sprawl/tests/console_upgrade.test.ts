import { assertEquals, assert } from "@std/assert";
import { defaultChar } from "../db/schemas.ts";
import { equipConsole, consoleSpec } from "../engine/net.ts";
import {
  buyExpertAi,
  buyExtraRam,
  plantLogicBomb,
  tuneFirewall,
} from "../engine/console-upgrade.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function deck(cash = 10000) {
  let c = defaultChar("N");
  c = {
    ...c,
    bityuan: cash,
    stats: { ...c.stats, cognition: 4, morphology: 2 },
  };
  c = equipConsole(c, "hyperion") as typeof c;
  return c;
}

Deno.test("extra RAM costs 250 and raises pool RAM", OPTS, () => {
  let c = deck();
  assertEquals(consoleSpec(c)!.ram, 3);
  const r = buyExtraRam(c, 2);
  assert(r.ok);
  if (!r.ok) return;
  assertEquals(r.next.consoleRamBonus, 2);
  assertEquals(consoleSpec(r.next)!.ram, 5);
  assertEquals(r.next.bityuan, 10000 - 500);
});

Deno.test("Gestalt RAM adds surgery fee", OPTS, () => {
  let c = defaultChar("N");
  c = {
    ...c,
    bityuan: 5000,
    stats: { ...c.stats, cognition: 3 },
    augs: [{ slug: "savvy-jack", name: "Savvy Jack" }],
  };
  c = equipConsole(c, "gestalt") as typeof c;
  const r = buyExtraRam(c, 1);
  assert(r.ok);
  if (!r.ok) return;
  // 250 + 500 surgery
  assertEquals(r.next.bityuan, 5000 - 750);
  assert(r.notes.some((n) => n.includes("surgery")));
});

Deno.test("expert AI capped by RAM", OPTS, () => {
  let c = deck();
  // hyperion RAM 3
  const ok = buyExpertAi(c, 3);
  assert(ok.ok);
  if (!ok.ok) return;
  c = ok.next;
  assertEquals(c.consoleAiCog, 3);
  assertEquals(consoleSpec(c)!.bonus, 1 + 3); // hull + AI
  const over = buyExpertAi(c, 1);
  assert(!over.ok);
});

Deno.test("firewall tune success raises FW", OPTS, () => {
  let c = deck();
  // force high rolls
  const r = tuneFirewall(c, () => 0.99);
  assert(r.ok);
  if (!r.ok) return;
  assertEquals(r.next.consoleFirewallBonus, 1);
  assertEquals(consoleSpec(r.next)!.firewall, 15); // 14+1
});

Deno.test("firewall tune fails on low roll", OPTS, () => {
  const c = deck();
  const r = tuneFirewall(c, () => 0);
  assert(!r.ok);
});

Deno.test("firewall max = RAM", OPTS, () => {
  let c = deck();
  c = { ...c, consoleFirewallBonus: 3 }; // ram 3
  const r = tuneFirewall(c, () => 0.99);
  assert(!r.ok);
  assert(String(r.error).includes("maxed"));
});

Deno.test("logic bomb plants on success", OPTS, () => {
  const c = deck();
  const r = plantLogicBomb(c, "event door", () => 0.99);
  assert(r.ok);
  if (!r.ok) return;
  assert(r.next.logicBomb?.eventTrigger);
  assertEquals(r.next.logicBomb?.hideDs, 16);
});

Deno.test("equip resets upgrades", OPTS, () => {
  let c = deck();
  c = {
    ...c,
    consoleRamBonus: 2,
    consoleFirewallBonus: 1,
    consoleAiCog: 1,
    logicBomb: {
      hideDs: 14,
      eventTrigger: false,
      at: 1,
    },
  };
  const eq = equipConsole(c, "nimbus");
  assert(!("error" in eq));
  assertEquals(eq.consoleRamBonus, 0);
  assertEquals(eq.consoleFirewallBonus, 0);
  assertEquals(eq.consoleAiCog, 0);
  assertEquals(eq.logicBomb, undefined);
});

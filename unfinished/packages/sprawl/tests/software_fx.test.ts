import { assertEquals, assert } from "@std/assert";
import { defaultChar } from "../db/schemas.ts";
import { equipConsole, installSoftware } from "../engine/net.ts";
import {
  afterSoftwareHack,
  applyNeuralSoak,
  prepareSoftwareHack,
  useSoftware,
} from "../engine/software-fx.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function deck(): ReturnType<typeof defaultChar> {
  let c = defaultChar("N");
  c = {
    ...c,
    stats: { ...c.stats, cognition: 3 },
  };
  c = equipConsole(c, "hyperion") as typeof c;
  return c;
}

Deno.test("prepare: match bonus + god-mode upgrade", OPTS, () => {
  let c = deck();
  c = installSoftware(c, "tunnel-rat") as typeof c;
  c = installSoftware(c, "god-mode") as typeof c;
  const p = prepareSoftwareHack(c, "control");
  assert(p.bonus >= 0);
  assertEquals(p.autoUpgrade, 1);
  assert(p.notes.some((n) => n.includes("God Mode")));
});

Deno.test("neuroshield soak", OPTS, () => {
  let c = deck();
  c = installSoftware(c, "neuroshield") as typeof c;
  const p = prepareSoftwareHack(c);
  assertEquals(p.neuralSoak, 2);
  const s = applyNeuralSoak(5, p.neuralSoak);
  assertEquals(s.blocked, 2);
  assertEquals(s.neural, 3);
});

Deno.test("run acidburn sets DS penalty and burns", OPTS, () => {
  let c = deck();
  c = installSoftware(c, "acidburn") as typeof c;
  const r = useSoftware(c, "acidburn", () => 0.5);
  assert(!r.error);
  assertEquals(r.next.net?.softDsPenalty, 1);
  assert(!r.next.software.includes("acidburn"));
  const p = prepareSoftwareHack(r.next);
  assertEquals(p.dsPenalty, 1);
});

Deno.test("run bleach clears tag and delays trace", OPTS, () => {
  let c = deck();
  c = {
    ...c,
    net: { tagged: true, heat: 2 },
  };
  c = installSoftware(c, "bleach") as typeof c;
  const r = useSoftware(c, "bleach", () => 0.99);
  assertEquals(r.next.net?.tagged, false);
  assert((r.next.net?.traceDelayMin ?? 0) >= 1);
  assert(!r.next.software.includes("bleach"));
});

Deno.test("run khali arms destroy countdown", OPTS, () => {
  let c = deck();
  c = installSoftware(c, "khali-9") as typeof c;
  const r = useSoftware(c, "khali-9", () => 0.99);
  assertEquals(r.next.net?.destroyTurns, 6);
  const tick = afterSoftwareHack(r.next, {
    success: true,
    resilienceAfterNeural: 10,
    rng: () => 0.99,
  });
  assertEquals(tick.next.net?.destroyTurns, 5);
});

Deno.test("reboot on flatline", OPTS, () => {
  let c = deck();
  c = installSoftware(c, "reboot") as typeof c;
  c = { ...c, resilience: 0 };
  const r = afterSoftwareHack(c, {
    success: false,
    resilienceAfterNeural: 0,
    rng: () => 0.99,
  });
  assertEquals(r.next.resilience, 2);
  assert(!r.next.software.includes("reboot"));
  assert(r.notes.some((n) => n.includes("ReBoot")));
});

Deno.test("vaxxer clears malware lock", OPTS, () => {
  let c = deck();
  c = {
    ...c,
    net: { malwareCleanDs: 10, consoleDownUntil: Date.now() + 99999 },
  };
  c = installSoftware(c, "vaxxer-v3") as typeof c;
  const r = useSoftware(c, "vaxxer-v3", () => 0.5);
  assertEquals(r.next.net?.malwareCleanDs, undefined);
});

Deno.test("passive soft run explains itself", OPTS, () => {
  let c = deck();
  c = installSoftware(c, "hunter") as typeof c;
  const r = useSoftware(c, "hunter");
  assert(r.notes[0]?.includes("passive"));
  assert(r.next.software.includes("hunter"));
});

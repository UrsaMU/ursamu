import { assert, assertEquals } from "@std/assert";
import { defaultChar } from "../db/schemas.ts";
import {
  checklist,
  nextHint,
  statAssignLines,
  statUsageLines,
  statsPrimer,
} from "../commands/chargen-status.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function plain(s: string): string {
  return s
    .replace(/%c[a-zA-Z]/g, "")
    .replace(/%[nrtbR]/g, "");
}

function joined(lines: string[]): string {
  return plain(lines.join("\n"));
}

function assertWidth(lines: string[]): void {
  for (const line of lines.join("\n").split("\n")) {
    if (!line.trim()) continue;
    const p = plain(line);
    // Engine header/footer may paint full-width with codes.
    if (/^[=-]+$/.test(p.trim())) continue;
    assert(
      p.length <= 78,
      `wide ${p.length}: ${p}`,
    );
  }
}

Deno.test("checklist names all five stats", OPTS, () => {
  const c = defaultChar();
  const lines = checklist(c);
  const t = joined(lines);
  assert(t.includes("Morphology"));
  assert(t.includes("Equilibrium"));
  assert(t.includes("Reaction"));
  assert(t.includes("Cognition"));
  assert(t.includes("Affinity"));
  assert(t.includes("4"));
  assert(t.includes("+chargen/start"));
  assert(t.includes("+chargen/stat"));
  // Stats/progress before help/steps copy.
  const iStats = t.indexOf("STATS");
  const iProg = t.indexOf("PROGRESS");
  const iSteps = t.indexOf("STEPS");
  const iHelp = t.indexOf("HELP");
  assert(iStats >= 0 && iProg > iStats);
  assert(iSteps > iProg && iHelp > iSteps);
  assert(!/name\s*=/i.test(t));
  assertWidth(lines);
});

Deno.test("nextHint starts draft when none", OPTS, () => {
  const c = defaultChar();
  assertEquals(nextHint(c), "+chargen/start");
});

Deno.test("stats primer shows uses and budget", OPTS, () => {
  const lines = statsPrimer({
    morphology: 0,
    equilibrium: 0,
    reaction: 2,
    cognition: 1,
    affinity: 0,
  });
  const t = joined(lines);
  assert(t.includes("REA"));
  assert(t.includes("aim") || t.includes("shoot"));
  assert(t.includes("3/4") || t.includes("1 left"));
  assertWidth(lines);
});

Deno.test("nextHint tracks spend progress", OPTS, () => {
  const c = defaultChar();
  c.chargenStatus = "draft";
  assert(nextHint(c).includes("stat"));
  c.stats = {
    morphology: 1,
    equilibrium: 0,
    reaction: 2,
    cognition: 1,
    affinity: 0,
  };
  assertEquals(nextHint(c).includes("background"), true);
  c.background = "nodejacker";
  c.backgroundName = "Nodejacker";
  assert(nextHint(c).includes("belongings"));
  c.belongingsPicked = 3;
  assert(nextHint(c).includes("cash"));
  c.bityuan = 400;
  assert(nextHint(c).includes("submit"));
});

Deno.test("stat assign and usage stay narrow", OPTS, () => {
  const c = defaultChar();
  c.chargenStatus = "draft";
  c.stats = {
    morphology: 0,
    equilibrium: 0,
    reaction: 2,
    cognition: 0,
    affinity: 0,
  };
  assertWidth(statAssignLines(c, "reaction", 2));
  assertWidth(statUsageLines());
  const u = joined(statUsageLines());
  assert(u.includes("reaction=2") || u.includes("stat"));
  assert(u.includes("MOR") || u.includes("Morphology"));
});

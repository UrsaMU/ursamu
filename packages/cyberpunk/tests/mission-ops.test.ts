/**
 * Pure mission-ops tests.
 */
import { assertEquals } from "@std/assert";
import {
  abortRun,
  advancePhase,
  allRequiredDone,
  completeObjective,
  completeRun,
  formatMissionBlock,
  markThreatDown,
  payoutShare,
  setThreats,
  startRun,
  tickHeat,
} from "../engine/mission-ops.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function baseRun() {
  const r = startRun({
    packId: "maelstrom-smash",
    roomId: "1",
    crewIds: ["2", "3"],
    crewNames: ["A", "B"],
    startedById: "2",
    startedByName: "A",
  });
  if (!r.ok) throw new Error(r.error);
  return r.run;
}

Deno.test("startRun builds pack state", OPTS, () => {
  const run = baseRun();
  assertEquals(run.templateId, "maelstrom-smash");
  assertEquals(run.crewIds.length, 2);
  assertEquals(run.phaseIndex, 0);
  assertEquals(run.objectives.every((o) => !o.done), true);
  assertEquals(run.payoutEb > 0, true);
  const block = formatMissionBlock(run);
  assertEquals(block.includes("MISSION:"), true);
  assertEquals(block.includes("OBJECTIVES:"), true);
});

Deno.test("startRun rejects bad pack", OPTS, () => {
  const r = startRun({
    packId: "nope",
    roomId: "1",
    crewIds: ["2"],
    crewNames: ["A"],
    startedById: "2",
    startedByName: "A",
  });
  assertEquals(r.ok, false);
});

Deno.test("advancePhase walks phases", OPTS, () => {
  let run = baseRun();
  const a = advancePhase(run);
  assertEquals(a.ok, true);
  if (!a.ok) return;
  run = a.run;
  assertEquals(run.phaseIndex, 1);
  assertEquals(run.status, "combat");
  assertEquals(
    Array.isArray(a.meta?.spawn) &&
      (a.meta!.spawn as string[]).length > 0,
    true,
  );
});

Deno.test("completeObjective + completeRun pays share", OPTS, () => {
  let run = baseRun();
  // Mark all required done
  for (const o of run.objectives) {
    if (o.optional) continue;
    const r = completeObjective(run, o.id);
    assertEquals(r.ok, true);
    if (r.ok) run = r.run;
  }
  assertEquals(allRequiredDone(run), true);
  const done = completeRun(run);
  assertEquals(done.ok, true);
  if (!done.ok) return;
  assertEquals(done.run.status, "complete");
  assertEquals(payoutShare(done.run), Math.floor(done.run.payoutEb / 2));
});

Deno.test("markThreatDown clears threats_clear objectives", OPTS, () => {
  let run = baseRun();
  const st = setThreats(run, [
    {
      npcId: "10",
      name: "Ganger 1",
      archetype: "boosterganger",
      status: "active",
    },
    {
      npcId: "11",
      name: "Ganger 2",
      archetype: "boosterganger",
      status: "active",
    },
  ]);
  assertEquals(st.ok, true);
  if (!st.ok) return;
  run = st.run;
  let r = markThreatDown(run, "10");
  assertEquals(r.ok, true);
  if (!r.ok) return;
  run = r.run;
  assertEquals(run.threats[0]?.status, "down");
  r = markThreatDown(run, "Ganger 2");
  assertEquals(r.ok, true);
  if (!r.ok) return;
  run = r.run;
  const clear = run.objectives.find((o) => o.auto === "threats_clear");
  assertEquals(clear?.done, true);
});

Deno.test("tickHeat can fail the run", OPTS, () => {
  let run = baseRun();
  // heat max 6 for maelstrom
  for (let i = 0; i < 10; i++) {
    const r = tickHeat(run, 1);
    assertEquals(r.ok, true);
    if (!r.ok) return;
    run = r.run;
    if (run.status === "failed") break;
  }
  assertEquals(run.status, "failed");
});

Deno.test("abortRun ends without complete", OPTS, () => {
  const run = baseRun();
  const r = abortRun(run);
  assertEquals(r.ok, true);
  if (!r.ok) return;
  assertEquals(r.run.status, "aborted");
  const c = completeRun(r.run);
  assertEquals(c.ok, false);
});

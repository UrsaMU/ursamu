/**
 * P0 mission runner smoke — pure ops, no server.
 */
import {
  MISSION_PACKS,
  getMissionPack,
  listMissionPackIds,
} from "../data/mission-packs.ts";
import {
  activateRun,
  advancePhase,
  allRequiredDone,
  completeObjective,
  completeRun,
  formatMissionBlock,
  listPacks,
  markThreatDown,
  payoutShare,
  setThreats,
  startRun,
  tickHeat,
  abortRun,
} from "../engine/mission-ops.ts";

let fails = 0;
function check(name: string, cond: boolean, detail = "") {
  if (cond) console.log(`  ok  ${name}`);
  else {
    fails++;
    console.log(`  FAIL ${name}${detail ? " — " + detail : ""}`);
  }
}

console.log("=== P0 mission runner smoke ===\n");

console.log("1. Packs");
check("3+ packs", MISSION_PACKS.length >= 3, String(MISSION_PACKS.length));
check("list ids", listMissionPackIds().includes("maelstrom-smash"));
check("get pack", !!getMissionPack("maelstrom"));
check("listPacks", listPacks().length === MISSION_PACKS.length);

console.log("\n2. startRun");
const started = startRun({
  packId: "maelstrom-smash",
  roomId: "1",
  crewIds: ["2", "5"],
  crewNames: ["gLITCH.exe", "Chrome"],
  startedById: "2",
  startedByName: "gLITCH.exe",
});
check("start ok", started.ok === true);
if (!started.ok) {
  console.log("ABORT", started.error);
  Deno.exit(1);
}
let run = started.run;
const act = activateRun(run);
check("activate", act.ok);
if (act.ok) run = act.run;
check("status active", run.status === "active");
check("phase 0", run.phaseIndex === 0);
check("crew 2", run.crewIds.length === 2);
check("spawn meta", Array.isArray(started.meta?.spawn));
check("block has MISSION", formatMissionBlock(run).includes("MISSION:"));

console.log("\n3. advance → combat");
const adv = advancePhase(run);
check("advance ok", adv.ok);
if (adv.ok) {
  run = adv.run;
  check("phase 1", run.phaseIndex === 1);
  check("status combat", run.status === "combat");
  const spawn = (adv.meta?.spawn as string[]) ?? [];
  check("spawn boosters", spawn.includes("boosterganger"), spawn.join(","));
}

console.log("\n4. threats");
const st = setThreats(run, [
  { npcId: "n1", name: "Razor", archetype: "boosterganger", status: "active" },
  { npcId: "n2", name: "Brick", archetype: "boosterganger", status: "active" },
]);
check("setThreats", st.ok);
if (st.ok) run = st.run;
let td = markThreatDown(run, "Razor");
check("down Razor", td.ok);
if (td.ok) run = td.run;
td = markThreatDown(run, "n2");
check("down Brick", td.ok);
if (td.ok) run = td.run;
const clearObj = run.objectives.find((o) => o.auto === "threats_clear");
check("threats_clear auto", !!clearObj?.done);

console.log("\n5. complete path");
for (const o of run.objectives) {
  if (o.done || o.optional) continue;
  const r = completeObjective(run, o.id);
  check(`obj ${o.id}`, r.ok);
  if (r.ok) run = r.run;
}
while (run.phaseIndex < run.phases.length - 1) {
  const a = advancePhase(run);
  if (!a.ok) break;
  run = a.run;
}
for (const o of run.objectives) {
  if (!o.done && o.auto === "phase_reach") {
    const r = completeObjective(run, o.id);
    if (r.ok) run = r.run;
  }
}
for (const o of run.objectives) {
  if (!o.optional && !o.done) {
    const r = completeObjective(run, o.id);
    if (r.ok) run = r.run;
  }
}
check("all required", allRequiredDone(run));
const done = completeRun(run);
check("completeRun", done.ok);
if (done.ok) {
  run = done.run;
  check("status complete", run.status === "complete");
  check("share 600", payoutShare(run) === 600, String(payoutShare(run)));
}

console.log("\n6. other packs");
for (const id of ["data-grab", "courier-wrong", "random"]) {
  const r = startRun({
    packId: id,
    roomId: "9",
    crewIds: ["2"],
    crewNames: ["Solo"],
    startedById: "2",
    startedByName: "Solo",
  });
  check(
    `start ${id}`,
    r.ok,
    r.ok ? r.run.templateId : (r as { error: string }).error,
  );
}

console.log("\n7. abort + heat fail");
let r2 = startRun({
  packId: "courier-wrong",
  roomId: "3",
  crewIds: ["2"],
  crewNames: ["A"],
  startedById: "2",
  startedByName: "A",
});
if (r2.ok) {
  const ab = abortRun(r2.run);
  check("abort", ab.ok && ab.run.status === "aborted");
}
r2 = startRun({
  packId: "courier-wrong",
  roomId: "4",
  crewIds: ["2"],
  crewNames: ["A"],
  startedById: "2",
  startedByName: "A",
});
if (r2.ok) {
  let runH = r2.run;
  for (let i = 0; i < 20; i++) {
    const t = tickHeat(runH, 1);
    if (!t.ok) break;
    runH = t.run;
    if (runH.status === "failed") break;
  }
  check("heat fail", runH.status === "failed");
}

console.log(`\n=== ${fails === 0 ? "SMOKE PASS" : "SMOKE FAIL (" + fails + ")"} ===`);
Deno.exit(fails === 0 ? 0 : 1);

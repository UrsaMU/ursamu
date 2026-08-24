/**
 * +run — AI-GM mission runner (end-to-end gigs).
 */
import { addCmd, DBO, gameHooks } from "@ursamu/ursamu";
import type { IUrsamuSDK, IDBObj } from "@ursamu/ursamu";
import type {
  ICPRCharacter,
  IMissionRun,
  IMissionThreat,
} from "../db/schemas.ts";
import {
  MISSION_PACKS,
  getMissionPack,
} from "../data/mission-packs.ts";
import { getNpcTemplate } from "../data/npcs.ts";
import { buildNpc } from "../engine/npc.ts";
import {
  abortRun,
  activateRun,
  advancePhase,
  completeObjective,
  completeRun,
  formatMissionBlock,
  listPacks,
  payoutShare,
  setThreats,
  startRun,
} from "../engine/mission-ops.ts";
import {
  emitRunAborted,
  emitRunCompleted,
  emitRunPhase,
  emitRunStarted,
} from "../engine/emitters.ts";
import {
  bar,
  div,
  hdr,
  lbl,
  val,
  acc,
  dim,
  ARR,
  ERR,
  OK,
  row,
  wrap,
} from "./chargen.ts";

const runDB = new DBO<IMissionRun>("cpr.runs");

function isStaff(u: IUrsamuSDK): boolean {
  const f = u.me.flags;
  return f.has("admin") || f.has("wizard") ||
    f.has("superuser") || f.has("staff");
}

function bare(id: string): string {
  return String(id ?? "").replace(/^#/, "").trim();
}

function cprOf(u: IUrsamuSDK): ICPRCharacter | null {
  return (u.me.state?.cpr as ICPRCharacter | undefined) ?? null;
}

async function activeInRoom(roomId: string): Promise<IMissionRun | null> {
  const rid = bare(roomId);
  const all = await runDB.all();
  return all.find((r) =>
    bare(r.roomId) === rid &&
    (r.status === "briefing" || r.status === "active" ||
      r.status === "combat")
  ) ?? null;
}

async function saveRun(run: IMissionRun): Promise<void> {
  const existing = await runDB.queryOne({ id: run.id });
  if (existing) {
    await runDB.modify({ id: run.id }, "$set", { ...run });
  } else {
    await runDB.create(run);
  }
}

async function crewInRoom(
  u: IUrsamuSDK,
): Promise<{ ids: string[]; names: string[] }> {
  const rid = bare(String(u.me.location ?? ""));
  // deno-lint-ignore no-explicit-any
  let here = await u.db.search({ location: rid } as any);
  if (!here.length && rid) {
    // deno-lint-ignore no-explicit-any
    here = await u.db.search({ location: `#${rid}` } as any);
  }
  // Fallback: same location as enactor
  if (!here.length) {
    // deno-lint-ignore no-explicit-any
    here = await u.db.search({
      location: u.me.location,
    } as any);
  }
  const ids: string[] = [];
  const names: string[] = [];
  for (const o of here) {
    const fl = o.flags instanceof Set
      ? [...o.flags].join(" ")
      : String(o.flags ?? "");
    if (!/\bplayer\b/i.test(fl)) continue;
    if (!/\bconnected\b/i.test(fl)) continue;
    if (/\b(wizard|admin|superuser|staff)\b/i.test(fl)) continue;
    // deno-lint-ignore no-explicit-any
    const st = o.state as any;
    const cpr = st?.cpr as ICPRCharacter | undefined;
    if (!cpr?.chargenComplete && cpr?.chargenStatus !== "approved") {
      continue;
    }
    ids.push(bare(o.id));
    names.push(
      String(st?.name ?? o.name ?? o.id),
    );
  }
  // Always include enactor if complete
  const meCpr = cprOf(u);
  if (meCpr?.chargenComplete || meCpr?.chargenStatus === "approved") {
    const mid = bare(u.me.id);
    if (!ids.includes(mid)) {
      ids.push(mid);
      names.push(u.me.name ?? mid);
    }
  }
  return { ids, names };
}

async function spawnForPhase(
  u: IUrsamuSDK,
  run: IMissionRun,
  archetypes: string[],
): Promise<IMissionRun> {
  if (!archetypes.length) return run;
  const rid = bare(run.roomId);
  const threats: IMissionThreat[] = [...run.threats];
  let n = 1;
  for (const arch of archetypes) {
    const tpl = getNpcTemplate(arch);
    if (!tpl) continue;
    const name = `${tpl.name} ${n++}`;
    const block = buildNpc(tpl, u.me.id, name, "aggressive");
    const obj = await u.db.create({
      name,
      flags: new Set(["thing", "npc"]),
      location: rid,
      state: {
        name,
        cprNpc: block,
        owner: u.me.id,
        missionRunId: run.id,
      },
    });
    threats.push({
      npcId: bare(obj.id),
      name,
      archetype: tpl.id,
      status: "active",
    });
  }
  const res = setThreats(run, threats);
  return res.ok ? res.run : run;
}

function printStatus(u: IUrsamuSDK, run: IMissionRun): void {
  const phase = run.phases[run.phaseIndex];
  const lines = [
    bar(),
    hdr("ACTIVE RUN"),
    bar(),
    row("TITLE", acc(run.title)),
    row("STATUS", val(run.status)),
    row(
      "PHASE",
      `${val(String(run.phaseIndex + 1))}/${run.phases.length}` +
        (phase ? `  ${acc(phase.title)}` : ""),
    ),
    row("HEAT", `${val(String(run.heat.ticks))}/${run.heat.max}`),
    row("PAYOUT", `${val(String(run.payoutEb))} ${dim("eb")}`),
    row("CREW", run.crewNames.join(", ") || dim("—")),
    div(),
    `  ${lbl("OBJECTIVES")}`,
  ];
  for (const o of run.objectives) {
    const mark = o.done ? OK : dim("·");
    lines.push(`  ${mark} ${o.done ? dim(o.text) : o.text}`);
  }
  if (run.threats.length) {
    lines.push(div());
    lines.push(`  ${lbl("THREATS")}`);
    for (const t of run.threats) {
      lines.push(
        `  ${t.status === "down" ? dim("×") : val("!")} ` +
          `${t.name} ${dim(t.status)}`,
      );
    }
  }
  lines.push(div());
  lines.push(
    `  ${ARR}Pose in this room — AI-GM drives the run.`,
  );
  lines.push(
    `  ${ARR}${val("+init")} ${dim("when combat starts")}  ` +
      `${val("+run/abort")} ${dim("to bail")}`,
  );
  lines.push(bar());
  u.send(lines.join("\r\n"));
}

async function listPacksCmd(u: IUrsamuSDK): Promise<void> {
  const lines = [
    bar(),
    hdr("MISSION PACKS"),
    bar(),
  ];
  for (const p of listPacks()) {
    lines.push(
      row(
        acc(p.id),
        `${val(String(p.payoutEb))} ${dim("eb")}`,
      ),
    );
    lines.push(...wrap(p.blurb, 74, "    "));
    if (p.roleHints.length) {
      lines.push(
        `    ${dim("roles:")} ${p.roleHints.join(", ")}`,
      );
    }
    lines.push("");
  }
  lines.push(
    `  ${ARR}${val("+run/start <id|random>")}  ` +
      dim("start with everyone here"),
  );
  lines.push(bar());
  u.send(lines.join("\r\n"));
}

async function startCmd(u: IUrsamuSDK, packArg: string): Promise<void> {
  const cpr = cprOf(u);
  if (!cpr?.chargenComplete && cpr?.chargenStatus !== "approved") {
    u.send(`${ERR}Finish chargen first.`);
    return;
  }
  const rid = bare(String(u.me.location ?? ""));
  if (!rid) {
    u.send(`${ERR}You are nowhere.`);
    return;
  }
  const existing = await activeInRoom(rid);
  if (existing) {
    u.send(
      `${ERR}Run already active: ${val(existing.title)}.  ` +
        `${ARR}${val("+run")}`,
    );
    return;
  }
  const packKey = packArg.trim() || "random";
  const crew = await crewInRoom(u);
  if (!crew.ids.length) {
    u.send(`${ERR}No eligible crew in this room.`);
    return;
  }
  const res = startRun({
    packId: packKey,
    roomId: rid,
    crewIds: crew.ids,
    crewNames: crew.names,
    startedById: bare(u.me.id),
    startedByName: u.me.name ?? bare(u.me.id),
  });
  if (!res.ok) {
    u.send(`${ERR}${res.error}`);
    return;
  }
  let run = res.run;
  const act = activateRun(run);
  if (act.ok) run = act.run;

  // Spawn phase-0 threats if any
  const spawn0 = (res.meta?.spawn as string[] | undefined) ?? [];
  run = await spawnForPhase(u, run, spawn0);
  await saveRun(run);

  // Ask AI-GM to watch this room (best-effort)
  try {
    // deno-lint-ignore no-explicit-any
    (gameHooks as any).emit?.("gm:watch-room", { roomId: rid });
  } catch { /* optional */ }

  emitRunStarted({
    runId: run.id,
    roomId: rid,
    title: run.title,
    crewIds: run.crewIds,
  });

  const scene = String(res.meta?.scene ?? run.phases[0]?.scene ?? "");
  const lines = [
    bar(),
    hdr("RUN STARTED"),
    bar(),
    row("TITLE", acc(run.title)),
    row("CREW", run.crewNames.join(", ")),
    row("PAYOUT", `${val(String(run.payoutEb))} ${dim("eb")}`),
    div(),
    `  ${lbl("BRIEF")}`,
    ...wrap(run.brief, 74, "  "),
    div(),
  ];
  if (scene) {
    lines.push(`  ${lbl("SCENE")}`);
    lines.push(...wrap(scene, 74, "  "));
    lines.push(div());
  }
  lines.push(`  ${lbl("OBJECTIVES")}`);
  for (const o of run.objectives) {
    lines.push(`  ${dim("·")} ${o.text}`);
  }
  lines.push(div());
  lines.push(
    `  ${ARR}Pose to play. AI-GM will adjudicate.  ` +
      `${val("+run")} ${dim("status")}`,
  );
  if (run.threats.length) {
    lines.push(
      `  ${ARR}${val("+init")} ${dim("— hostiles are on site")}`,
    );
  }
  lines.push(bar());
  u.send(lines.join("\r\n"));

  // Broadcast brief to room crew via util if available
  for (const cid of run.crewIds) {
    if (cid === bare(u.me.id)) continue;
    try {
      u.send(
        `${OK}Run started: ${val(run.title)}. ` +
          `${ARR}${val("+run")} for status.`,
        cid,
      );
    } catch { /* ignore */ }
  }
}

async function advanceCmd(u: IUrsamuSDK): Promise<void> {
  if (!isStaff(u)) {
    u.send(`${ERR}Staff only (or let the AI-GM advance).`);
    return;
  }
  const rid = bare(String(u.me.location ?? ""));
  const run0 = await activeInRoom(rid);
  if (!run0) {
    u.send(`${ERR}No active run here.`);
    return;
  }
  const res = advancePhase(run0);
  if (!res.ok) {
    u.send(`${ERR}${res.error}`);
    return;
  }
  let run = res.run;
  const spawn = (res.meta?.spawn as string[] | undefined) ?? [];
  run = await spawnForPhase(u, run, spawn);
  await saveRun(run);
  const phase = run.phases[run.phaseIndex];
  emitRunPhase({
    runId: run.id,
    roomId: rid,
    phaseIndex: run.phaseIndex,
    phaseTitle: phase?.title ?? "",
    kind: phase?.kind ?? "rp",
  });
  u.send(
    `${OK}Phase → ${val(phase?.title ?? String(run.phaseIndex))}  ` +
      `${dim(phase?.kind ?? "")}`,
  );
  if (spawn.length) {
    u.send(
      `${ARR}Spawned threats. ${val("+init")} when ready.`,
    );
  }
}

async function objectiveCmd(
  u: IUrsamuSDK,
  arg: string,
): Promise<void> {
  if (!isStaff(u)) {
    u.send(`${ERR}Staff only (AI-GM can check these off).`);
    return;
  }
  const rid = bare(String(u.me.location ?? ""));
  const run0 = await activeInRoom(rid);
  if (!run0) {
    u.send(`${ERR}No active run here.`);
    return;
  }
  const res = completeObjective(run0, arg);
  if (!res.ok) {
    u.send(`${ERR}${res.error}`);
    return;
  }
  await saveRun(res.run);
  u.send(`${OK}Objective updated.`);
  if (res.meta?.allRequiredDone) {
    u.send(
      `${ARR}All required objectives done — ` +
        `${val("+run/complete")} or let AI finish.`,
    );
  }
  printStatus(u, res.run);
}

async function completeCmd(u: IUrsamuSDK): Promise<void> {
  const rid = bare(String(u.me.location ?? ""));
  const run0 = await activeInRoom(rid);
  if (!run0) {
    u.send(`${ERR}No active run here.`);
    return;
  }
  const mid = bare(u.me.id);
  if (!isStaff(u) && !run0.crewIds.includes(mid)) {
    u.send(`${ERR}Not on this crew.`);
    return;
  }
  const res = completeRun(run0);
  if (!res.ok) {
    u.send(`${ERR}${res.error}`);
    return;
  }
  const run = res.run;
  const share = payoutShare(run);
  await saveRun(run);

  // Pay crew
  for (const cid of run.crewIds) {
    try {
      // deno-lint-ignore no-explicit-any
      let rows = await u.db.search({ id: cid } as any);
      if (!rows[0]) {
        // deno-lint-ignore no-explicit-any
        rows = await u.db.search({ id: `#${cid}` } as any);
      }
      const pl = rows[0];
      if (!pl) continue;
      // deno-lint-ignore no-explicit-any
      const st = (pl.state ?? {}) as any;
      const cpr = (st.cpr ?? {}) as ICPRCharacter;
      const eb = Math.floor(Number(cpr.eurodollars ?? 0)) + share;
      const rep = Math.floor(Number(cpr.reputation ?? 0)) + 1;
      await u.db.modify(pl.id, "$set", {
        "state.cpr.eurodollars": eb,
        "state.cpr.reputation": rep,
      });
      u.send(
        `${OK}Run complete — ${val(String(share))} eb ` +
          `+1 rep. Balance ${val(String(eb))} eb.`,
        bare(String(pl.id)),
      );
    } catch { /* continue */ }
  }

  emitRunCompleted({
    runId: run.id,
    roomId: rid,
    title: run.title,
    payoutEb: run.payoutEb,
    crewIds: run.crewIds,
  });

  u.send(
    `${OK}Mission ${val(run.title)} complete. ` +
      `${val(String(share))} eb each.`,
  );
}

async function abortCmd(u: IUrsamuSDK): Promise<void> {
  const rid = bare(String(u.me.location ?? ""));
  const run0 = await activeInRoom(rid);
  if (!run0) {
    u.send(`${ERR}No active run here.`);
    return;
  }
  const mid = bare(u.me.id);
  if (!isStaff(u) && run0.startedById !== mid) {
    u.send(`${ERR}Only the starter or staff can abort.`);
    return;
  }
  const res = abortRun(run0);
  if (!res.ok) {
    u.send(`${ERR}${res.error}`);
    return;
  }
  await saveRun(res.run);
  emitRunAborted({ runId: res.run.id, roomId: rid });
  u.send(`${OK}Run aborted. No payout.`);
}

addCmd({
  name: "+run",
  pattern: /^\+run(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Cyberpunk RED",
  help: `+run[/<switch>] [<args>]  — AI-GM mission runner.

Switches:
  (none)|/status     Active run in this room.
  /list              Mission packs.
  /start [id|random] Start a run with everyone here.
  /advance           (Staff) Next phase + spawns.
  /objective <id>    (Staff) Mark objective done.
  /complete          Finish + pay crew (objectives done).
  /abort             Bail with no pay.

Examples:
  +run/list
  +run/start maelstrom-smash
  +run/start random
  +run`,
  exec: async (u: IUrsamuSDK) => {
    const sw = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const arg = u.util.stripSubs(u.cmd.args[1] ?? "").trim();

    if (!sw || sw === "status") {
      const rid = bare(String(u.me.location ?? ""));
      const run = await activeInRoom(rid);
      if (!run) {
        u.send(
          `${dim("No active run.")}  ` +
            `${ARR}${val("+run/list")}  ` +
            `${val("+run/start random")}`,
        );
        return;
      }
      printStatus(u, run);
      return;
    }
    if (sw === "list") {
      await listPacksCmd(u);
      return;
    }
    if (sw === "start") {
      await startCmd(u, arg);
      return;
    }
    if (sw === "advance") {
      await advanceCmd(u);
      return;
    }
    if (sw === "objective" || sw === "obj") {
      await objectiveCmd(u, arg);
      return;
    }
    if (sw === "complete" || sw === "done") {
      await completeCmd(u);
      return;
    }
    if (sw === "abort" || sw === "fail") {
      await abortCmd(u);
      return;
    }
    // bare +run/maelstrom-smash style
    if (getMissionPack(sw)) {
      await startCmd(u, sw);
      return;
    }
    u.send(`${ERR}Unknown switch. ${ARR}${val("+help run")}`);
  },
});

// Alias
addCmd({
  name: "+mission",
  pattern: /^\+mission(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Cyberpunk RED",
  help: "+mission — alias for +run.",
  exec: async (u: IUrsamuSDK) => {
    const sw = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const arg = u.util.stripSubs(u.cmd.args[1] ?? "").trim();
    u.cmd.args = [sw, arg];
    // Re-dispatch via synthetic: call list/start directly
    if (!sw || sw === "status") {
      const rid = bare(String(u.me.location ?? ""));
      const run = await activeInRoom(rid);
      if (!run) {
        u.send(
          `${dim("No active run.")}  ` +
            `${ARR}${val("+run/list")}`,
        );
        return;
      }
      printStatus(u, run);
      return;
    }
    if (sw === "list") {
      await listPacksCmd(u);
      return;
    }
    if (sw === "start" || getMissionPack(sw)) {
      await startCmd(u, sw === "start" ? arg : sw);
      return;
    }
    if (sw === "complete") {
      await completeCmd(u);
      return;
    }
    if (sw === "abort") {
      await abortCmd(u);
      return;
    }
    u.send(`${ERR}Use ${val("+run")} switches.`);
  },
});

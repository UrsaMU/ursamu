/**
 * +pharma -- Pharmaceutical Synthesis (Medtech Ability)
 */
import { addCmd, DBO } from "@ursamu/mush";
import type { IUrsamuSDK } from "@ursamu/mush";
import { bar, div, hdr, lbl, val, acc, dim, ARR, ERR, OK, row, wrap, grid } from "./chargen.ts";
import type { ICPRCharacter, IPharmaProject } from "../db/schemas.ts";
import { getDrug, synthesisDrugs } from "../data/drugs.ts";
import { synthesisDurationMs } from "../engine/economy.ts";
import { emitPharmaSynthesized } from "../engine/emitters.ts";

const pharmaDB = new DBO<IPharmaProject>("cpr.pharma");

addCmd({
  name: "+pharma",
  pattern: /^\+pharma(?:\/(list|synth|check|queue))?\s*(.*)/i,
  lock: "connected",
  category: "Cyberpunk RED",
  help: `+pharma[/<switch>] [<name>]  -- Pharmaceutical synthesis (Medtech only).

Switches:
  /list           Show synthesizable drugs and requirements.
  /queue          View your active synthesis projects.
  /synth <name>   Begin synthesizing a drug.
  /check <id>     Check if synthesis is complete and collect.

Examples:
  +pharma/list              See what you can synthesize.
  +pharma/synth speedheal   Begin synthesizing Speedheal.
  +pharma/queue             Check active projects.
  +pharma/check abc123      Check project abc123.`,

  exec: async (u: IUrsamuSDK) => {
    const sw = (u.cmd.args[0] ?? "list").toLowerCase().trim();
    const arg = u.util.stripSubs(u.cmd.args[1] ?? "").trim().toLowerCase().replace(/ /g, "_");
    const cpr = u.me.state.cpr as ICPRCharacter | undefined;
    if (!cpr?.chargenComplete) { u.send(`${ERR}No character found.`); return; }

    if (cpr.role !== "medtech" && !u.me.flags.has("admin")) {
      u.send(`${ERR}Only Medtech characters can synthesize pharmaceuticals.`); return;
    }

    if (sw === "list") { showDrugList(u, cpr); return; }
    if (sw === "queue") { await showQueue(u); return; }
    if (sw === "synth") { await startSynth(u, cpr, arg); return; }
    if (sw === "check") { await checkSynth(u, cpr, arg); return; }
    u.send(`${ERR}Unknown switch ${val("/" + sw)}. Type ${val("+pharma")} for help.`);
  },
});

function showDrugList(u: IUrsamuSDK, cpr: ICPRCharacter): void {
  const pharmaRank = getPharmaRank(cpr);
  const available = synthesisDrugs(pharmaRank);
  const lines = [
    bar(),
    hdr("SYNTHESIZABLE CHEMS"),
    bar(),
    row("PHARMA RANK", val(pharmaRank)),
    div(),
  ];
  if (available.length === 0) {
    lines.push(`  ${ARR}No chems available at current rank. Increase Pharma specialty.`);
  } else {
    for (const drug of available) {
      const dur = drug.durationMs === 0 ? "instant" : `${Math.round(drug.durationMs / 60000)}m`;
      const timeStr = synthTimeStr(drug.priceCategory ?? "cheap");
      lines.push(
        row(
          acc(drug.name.replace(/_/g, " ")),
          `DV:${val(drug.synthesisDV ?? 15)}  ${dim("[" + dur + "]")}  Time:${dim(timeStr)}  Cost:${val((drug.synthesisMaterials ?? 100) + " eb")}`,
        ),
      );
      lines.push(...wrap(drug.effects, 74, "    "));
    }
  }
  lines.push(bar());
  u.send(lines.join("\r\n"));
}

async function showQueue(u: IUrsamuSDK): Promise<void> {
  const projects = await pharmaDB.find({ techId: u.me.id, completed: false, failed: false });
  if (projects.length === 0) {
    u.send(`${ARR}No active chem synthesis projects.`);
    return;
  }
  const lines = [
    bar(),
    hdr("ACTIVE SYNTHESIS QUEUE"),
    bar(),
  ];
  for (const p of projects) {
    const ready = Date.now() >= p.completesAt;
    const status = ready ? `%cg:: READY%cn` : dim(timeUntil(p.completesAt));
    lines.push(row(acc(p.id.slice(0, 8)), `${val(p.drugName.replace(/_/g, " "))}  DV:${val(p.dv)} -- ${status}`));
  }
  lines.push(bar());
  u.send(lines.join("\r\n"));
}

async function startSynth(u: IUrsamuSDK, cpr: ICPRCharacter, drugName: string): Promise<void> {
  if (!drugName) { u.send(`${ERR}Specify chem: ${val("+pharma/synth <name>")}`); return; }
  const def = getDrug(drugName);
  if (!def) { u.send(`${ERR}Unknown pharmaceutical ${val(drugName)}. Type ${val("+pharma/list")}.`); return; }
  if (!def.synthesizable) { u.send(`${ERR}${val(def.name.replace(/_/g, " "))} cannot be synthesized.`); return; }

  const pharmaRank = getPharmaRank(cpr);
  if (pharmaRank < (def.minPharmaRank ?? 1)) {
    u.send(`${ERR}Requires Pharmaceutical Rank ${val(def.minPharmaRank ?? 1)}. You have ${val(pharmaRank)}.`);
    return;
  }

  const matCost = def.synthesisMaterials ?? 100;
  if (cpr.eurodollars < matCost) {
    u.send(`${ERR}Materials cost ${val(matCost + " eb")}. You have ${val(cpr.eurodollars + " eb")}.`);
    return;
  }

  const durationMs = synthesisDurationMs(def.priceCategory ?? "cheap");
  const dv = def.synthesisDV ?? 15;

  const project: IPharmaProject = {
    id: crypto.randomUUID(),
    techId: u.me.id,
    drugName,
    dv,
    materialsCost: matCost,
    startedAt: Date.now(),
    completesAt: Date.now() + durationMs,
    completed: false,
    failed: false,
  };

  await pharmaDB.create(project);
  await u.db.modify(u.me.id, "$inc", { "state.cpr.eurodollars": -matCost });
  u.send([
    div(),
    `  ${OK}Synthesis started: ${val(def.name.replace(/_/g, " "))}`,
    row("DV",         val(dv)),
    row("Materials",  val(matCost + " eb")),
    row("Ready in",   dim(timeUntil(project.completesAt))),
    row("Project ID", `${acc(project.id.slice(0, 8))} ${dim("-- use +pharma/check <id> when ready")}`),
    div(),
  ].join("\r\n"));
}

async function checkSynth(u: IUrsamuSDK, cpr: ICPRCharacter, idPrefix: string): Promise<void> {
  if (!idPrefix) { u.send(`${ERR}Provide project ID: ${val("+pharma/check <id>")}`); return; }
  const projects = await pharmaDB.find({ techId: u.me.id });
  const project = projects.find((p) => p.id.startsWith(idPrefix));
  if (!project) { u.send(`${ERR}No project found with ID ${val(idPrefix)}.`); return; }
  if (project.completed) {
    u.send(`${ARR}${val(project.drugName.replace(/_/g, " "))} synthesis already completed.`);
    return;
  }
  if (Date.now() < project.completesAt) {
    u.send(`${ARR}Not ready yet. ${dim(timeUntil(project.completesAt))} remaining.`);
    return;
  }

  // Synthesis roll: TECH + Pharmaceuticals + 1d10 vs DV
  const pharmSkill = cpr.skills["pharmaceuticals"] ?? 0;
  const pharmaRank = getPharmaRank(cpr);
  const roll = Math.floor(Math.random() * 10) + 1;
  const total = cpr.stats.tech + pharmSkill + pharmaRank + roll;
  const success = total >= project.dv;

  u.send([
    div(),
    `  ${ARR}Synthesis check: ${val(project.drugName.replace(/_/g, " "))}`,
    row("Roll",  val(roll)),
    row("Total", val(total)),
    row("DV",    val(project.dv)),
    div(),
    success
      ? `  ${OK}1 dose of ${val(project.drugName.replace(/_/g, " "))} synthesized. Coordinate with staff for item.`
      : `  ${ERR}Synthesis failed. Materials lost.`,
    div(),
  ].join("\r\n"));

  if (success) {
    await pharmaDB.update({ id: project.id }, { completed: true });
    await emitPharmaSynthesized(u.me, project.drugName);
  } else {
    await pharmaDB.update({ id: project.id }, { failed: true });
  }
}

function getPharmaRank(cpr: ICPRCharacter): number {
  const rd = cpr.roleData as Record<string, unknown>;
  const specs = rd.medSpecialties as Record<string, number> | undefined;
  return specs?.pharmaceuticals ?? 0;
}

const synthTimeStr = (cat: string): string => {
  const hrs: Record<string, string> = {
    cheap: "1h", everyday: "1h", costly: "6h", premium: "24h", expensive: "3d", very_expensive: "7d",
  };
  return hrs[cat] ?? "1h";
};

const timeUntil = (ts: number): string => {
  const ms = ts - Date.now();
  if (ms <= 0) return "Ready!";
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

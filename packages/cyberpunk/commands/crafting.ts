/**
 * +craft -- Tech Maker Crafting System
 */
import { addCmd, DBO } from "@ursamu/ursamu";
import type { IUrsamuSDK } from "@ursamu/ursamu";
import { bar, div, hdr, lbl, val, acc, dim, ARR, ERR, OK, row, wrap, grid } from "./chargen.ts";
import type { ICPRCharacter, ICraftProject, IBlueprint } from "../db/schemas.ts";
import {
  createCraftProject, craftProgressCheck, getMakerRank,
  totalMakerPoints, fieldRepairCheck, createBlueprint,
  timeRemainingDisplay, materialsRequired,
} from "../engine/crafting.ts";
import { craftDVAndTime, priceToEB } from "../engine/dice.ts";
import { emitCraftStarted, emitCraftCompleted, emitCraftFailed } from "../engine/emitters.ts";

const craftDB = new DBO<ICraftProject>("cpr.projects");
const blueprintDB = new DBO<IBlueprint>("cpr.blueprints");

addCmd({
  name: "+craft",
  pattern: /^\+craft(?:\/(start|check|list|cancel|blueprint|fieldrepair|makerpoints))?\s*(.*)/i,
  lock: "connected",
  category: "Cyberpunk RED",
  help: `+craft[/<switch>] [<argument>]  -- Tech Maker crafting system.

Switches:
  /list                        Show your active projects.
  /makerpoints                 Show Maker specialty allocation.
  /start <item>=<category>     Begin a fabrication project.
  /check <project_id>          Check if a project is complete.
  /cancel <project_id>         Abandon a project.
  /blueprint <item>=<category> Create a blueprint for an item.
  /fieldrepair <item> <DV>     Perform a quick field repair.

Price categories: cheap, everyday, costly, premium, expensive, very_expensive

Examples:
  +craft/list                  See active projects.
  +craft/start Pistol=costly   Begin crafting a costly pistol.
  +craft/check abc123          Check project abc123.
  +craft/fieldrepair Jacket 15 Quick-fix a jacket (DV 15).`,

  exec: async (u: IUrsamuSDK) => {
    const sw = (u.cmd.args[0] ?? "list").toLowerCase().trim();
    const arg = u.util.stripSubs(u.cmd.args[1] ?? "").trim();
    const cpr = u.me.state.cpr as ICPRCharacter | undefined;
    if (!cpr?.chargenComplete) { u.send(`${ERR}No character found.`); return; }
    if (cpr.role !== "tech" && sw !== "fieldrepair" && sw !== "list") {
      u.send(`${ERR}Only Tech characters can use the Maker ability.`); return;
    }

    if (sw === "list") { await listProjects(u, cpr); return; }
    if (sw === "makerpoints") { showMakerPoints(u, cpr); return; }
    if (sw === "start") { await startProject(u, cpr, arg, "fabricate"); return; }
    if (sw === "check") { await checkProject(u, cpr, arg); return; }
    if (sw === "cancel") { await cancelProject(u, cpr, arg); return; }
    if (sw === "blueprint") { await makeBlueprint(u, cpr, arg); return; }
    if (sw === "fieldrepair") { doFieldRepair(u, cpr, arg); return; }
    u.send(`${ERR}Unknown switch ${val("/" + sw)}. Type ${val("+craft")} for help.`);
  },
});

function showMakerPoints(u: IUrsamuSDK, cpr: ICPRCharacter): void {
  const total = totalMakerPoints(cpr.roleRank);
  const rd = cpr.roleData as Record<string, unknown>;
  const specs = (rd.makerSpecialties ?? {}) as Record<string, number>;
  const used = Object.values(specs).reduce((s, v) => s + v, 0);
  u.send([
    bar(),
    hdr("MAKER SPECIALTY"),
    bar(),
    row("TOTAL POINTS", `${val(total)} ${dim(`(Rank ${cpr.roleRank} x 2)`)}`),
    row("USED", val(used)),
    div(),
    row("Field",       val(specs.field ?? 0)),
    row("Upgrade",     val(specs.upgrade ?? 0)),
    row("Fabrication", val(specs.fabrication ?? 0)),
    row("Invention",   val(specs.invention ?? 0)),
    div(),
    `  ${dim("Ask staff to adjust via +cpr/setmaker.")}`,
    bar(),
  ].join("\r\n"));
}

async function listProjects(u: IUrsamuSDK, cpr: ICPRCharacter): Promise<void> {
  const projects = await craftDB.find({ techId: u.me.id, completed: false, failed: false });
  if (projects.length === 0) {
    u.send(`${ARR}No active tech work projects.`);
    return;
  }
  const lines = [
    bar(),
    hdr("ACTIVE TECH WORK"),
    bar(),
  ];
  for (const p of projects) {
    const ready = Date.now() >= p.completesAt;
    const timeStr = ready ? `%cg:: READY%cn` : `${dim(timeRemainingDisplay(p.completesAt))}`;
    lines.push(row(acc(p.id.slice(0, 8)), `${val(p.itemName)} ${dim("[" + p.type + "]")} DV:${val(p.dv)} -- ${timeStr}`));
  }
  lines.push(bar());
  u.send(lines.join("\r\n"));
}

async function startProject(u: IUrsamuSDK, cpr: ICPRCharacter, arg: string, type: ICraftProject["type"]): Promise<void> {
  const [itemName, priceCategory] = arg.split("=").map((s) => s.trim());
  if (!itemName || !priceCategory) {
    u.send(`${ERR}Usage: ${val("+craft/start <item>=<priceCategory>")}`);
    return;
  }

  const validCats = ["cheap", "everyday", "costly", "premium", "expensive", "very_expensive"];
  if (!validCats.includes(priceCategory.toLowerCase())) {
    u.send([
      `${ERR}Invalid price category ${val(priceCategory)}.`,
      `  ${dim("Valid:")} ${validCats.map(acc).join(dim(", "))}`,
    ].join("\r\n"));
    return;
  }

  const makerRank = getMakerRank(cpr, "fabrication");
  const matCost = materialsRequired(priceCategory, type);

  if (cpr.eurodollars < matCost) {
    u.send(`${ERR}Materials cost ${val(matCost + " eb")}. You have ${val(cpr.eurodollars + " eb")}.`);
    return;
  }

  const project = createCraftProject({
    techId: u.me.id, techName: u.util.displayName(u.me, u.me),
    itemName, type, priceCategory, skill: "weaponstech",
  }, makerRank);

  await craftDB.create(project);
  await u.db.modify(u.me.id, "$inc", { "state.cpr.eurodollars": -matCost });
  await emitCraftStarted(u.me, project);

  u.send([
    div(),
    `  ${OK}Tech work started: ${val(itemName)} ${dim("[" + type + "]")} DV:${val(project.dv)}`,
    row("Materials cost", val(matCost + " eb")),
    row("Ready in",       dim(timeRemainingDisplay(project.completesAt))),
    row("Project ID",     `${acc(project.id.slice(0, 8))} ${dim("-- use +craft/check <id> when ready")}`),
    div(),
  ].join("\r\n"));
}

async function checkProject(u: IUrsamuSDK, cpr: ICPRCharacter, idPrefix: string): Promise<void> {
  if (!idPrefix) { u.send(`${ERR}Provide project ID: ${val("+craft/check <id>")}`); return; }
  const projects = await craftDB.find({ techId: u.me.id });
  const project = projects.find((p) => p.id.startsWith(idPrefix));
  if (!project) { u.send(`${ERR}No project found with ID starting ${val(idPrefix)}.`); return; }
  if (project.completed || project.failed) {
    u.send(`${ARR}Project ${val(project.itemName)} is already ${project.completed ? "complete" : "failed"}.`);
    return;
  }

  const result = craftProgressCheck(cpr, project);
  if (!result.ready) {
    u.send(`${ARR}${val(project.itemName)} is not ready yet. ${dim(timeRemainingDisplay(project.completesAt))}`);
    return;
  }

  u.send([
    div(),
    `  ${ARR}Fabrication check: ${val(project.itemName)}`,
    row("Roll",  val(result.roll)),
    row("Total", val(result.total)),
    row("DV",    val(result.dv)),
    div(),
    result.success
      ? `  ${OK}${val(project.itemName)} fabricated. Coordinate with staff for the item.`
      : `  ${ERR}Fabrication failed. Project ruined -- materials lost.`,
    div(),
  ].join("\r\n"));

  if (result.success) {
    await craftDB.update({ id: project.id }, { completed: true });
    await emitCraftCompleted(u.me, project);
  } else {
    await craftDB.update({ id: project.id }, { failed: true });
    await emitCraftFailed(u.me, project);
  }
}

async function cancelProject(u: IUrsamuSDK, cpr: ICPRCharacter, idPrefix: string): Promise<void> {
  if (!idPrefix) { u.send(`${ERR}Provide project ID: ${val("+craft/cancel <id>")}`); return; }
  const projects = await craftDB.find({ techId: u.me.id });
  const project = projects.find((p) => p.id.startsWith(idPrefix));
  if (!project) { u.send(`${ERR}Project not found.`); return; }
  await craftDB.update({ id: project.id }, { failed: true });
  u.send(`${OK}Project ${val(project.itemName)} cancelled. Materials forfeited.`);
}

async function makeBlueprint(u: IUrsamuSDK, cpr: ICPRCharacter, arg: string): Promise<void> {
  const [itemName, priceCategory] = arg.split("=").map((s) => s.trim());
  if (!itemName || !priceCategory) {
    u.send(`${ERR}Usage: ${val("+craft/blueprint <item>=<category>")}`);
    return;
  }
  const bp = createBlueprint(u.me.id, u.util.displayName(u.me, u.me), itemName, `Blueprint for ${itemName}`, priceCategory, "weaponstech");
  await blueprintDB.create(bp);
  u.send([
    div(),
    `  ${OK}Blueprint logged: ${val(itemName)} ${dim("(" + priceCategory + ")")}`,
    row("DV",  val(bp.dv)),
    row("ID",  acc(bp.id.slice(0, 8))),
    div(),
  ].join("\r\n"));
}

function doFieldRepair(u: IUrsamuSDK, cpr: ICPRCharacter, arg: string): void {
  const parts = arg.trim().split(/\s+/);
  const itemName = parts.slice(0, -1).join(" ");
  const dv = parseInt(parts[parts.length - 1], 10);
  if (!itemName || isNaN(dv)) {
    u.send(`${ERR}Usage: ${val("+craft/fieldrepair <item> <DV>")}`);
    return;
  }

  const result = fieldRepairCheck(cpr, "basic_tech", dv);
  u.send([
    div(),
    `  ${ARR}Field repair: ${val(itemName)}`,
    row("Roll",  val(result.roll)),
    row("Total", val(result.total)),
    row("DV",    val(dv)),
    div(),
    result.success
      ? `  ${OK}Repair successful -- temporary fix holds.`
      : `  ${ERR}Repair failed.`,
    div(),
  ].join("\r\n"));
}

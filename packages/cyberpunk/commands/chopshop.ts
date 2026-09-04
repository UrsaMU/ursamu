/**
 * +chopshop -- Cyberware Harvesting and Black Market Installation
 */
import { addCmd, DBO } from "@ursamu/mush";
import type { IUrsamuSDK } from "@ursamu/mush";
import { bar, div, hdr, lbl, val, acc, bad, dim, ARR, ERR, OK, row, wrap, tbl } from "./chargen.ts";
import type { ICPRCharacter, IChopshopQueue, ICyberware } from "../db/schemas.ts";
import { getCyberware } from "../data/cyberware.ts";
import { rollVariableHL, applyHumanityLoss } from "../engine/cyberpsychosis.ts";
import { recalcDerived } from "../engine/character.ts";
import { priceToEB } from "../engine/dice.ts";
import { emitChopshopHarvest, emitChopshopInstallComplete } from "../engine/emitters.ts";
import { openShop, closeShop, listShop, buyFromShop, sellToShop } from "./chopshop-shop.ts";
import { medtechQueueCapacity, chopshopSlotCost } from "../engine/roleCapacity.ts";

const chopDB = new DBO<IChopshopQueue>("cpr.chopshop");

const rc = (label: string, width: number) => ({ label, width, align: "right" as const });
const rv = (n: number) => val(String(n));

/** DV for surgery based on install tier. */
const tierDV = (t: string) => t === "hospital" ? 17 : t === "clinic" ? 15 : 13;

addCmd({
  name: "+chopshop",
  pattern: /^\+chopshop(?:\/(open|close|list|buy|sell|harvest|install|queue|complete|prices))?\s*(.*)/i,
  lock: "connected",
  category: "Cyberpunk RED",
  help: `+chopshop[/<switch>] [<argument>]  -- Black-market cyberware operations.

Requires Medtech role or admin for most operations.

Switches:
  /open [<name>]               (Medtech) Open a chopshop in the current room.
  /close                       (Medtech) Close your active chopshop.
  /list                        Show the active chopshop in this room.
  /buy <cyberware>             Buy and install chrome from the room's chopshop.
  /sell <cyberware>            Sell extracted chrome to the room's chopshop.
  /prices                      Show chop shop service costs.
  /queue                       View pending chop shop jobs.
  /harvest <target>=<cyberware>  Extract cyberware from a target.
  /install <target>=<cyberware>  Install extracted cyberware on a target.
  /complete <job_id>           (Admin) Mark a job as complete.

Examples:
  +chopshop/open Doc Samir's Clinic   Open your chopshop.
  +chopshop/list                      See what's available here.
  +chopshop/buy neural_link           Buy and install a neural link.
  +chopshop/sell neural_link          Sell extracted chrome to the shop.
  +chopshop/harvest Victim=neural_link  Extract neural link from Victim.`,

  exec: async (u: IUrsamuSDK) => {
    const sw = (u.cmd.args[0] ?? "queue").toLowerCase().trim();
    const arg = u.util.stripSubs(u.cmd.args[1] ?? "").trim();
    const cpr = u.me.state.cpr as ICPRCharacter | undefined;
    if (!cpr?.chargenComplete) { u.send(`${ERR}No character found.`); return; }

    const canOperate = cpr.role === "medtech" || u.me.flags.has("admin") || u.me.flags.has("wizard");
    const openToAll = sw === "prices" || sw === "queue" || sw === "list" || sw === "buy" || sw === "sell";
    if (!canOperate && !openToAll) {
      u.send(`${ERR}Only a ripperdoc (Medtech) or admin can run chop shop operations.`); return;
    }

    if (sw === "open")     { await openShop(u, arg); return; }
    if (sw === "close")    { await closeShop(u); return; }
    if (sw === "list")     { await listShop(u); return; }
    if (sw === "buy")      { await buyFromShop(u, arg); return; }
    if (sw === "sell")     { await sellToShop(u, arg); return; }
    if (sw === "prices")   { showPrices(u); return; }
    if (sw === "queue")    { await showQueue(u); return; }
    if (sw === "harvest")  { await harvestCyberware(u, cpr, arg); return; }
    if (sw === "install")  { await installHarvested(u, cpr, arg); return; }
    if (sw === "complete") { await completeJob(u, arg); return; }
    u.send(`${ERR}Unknown switch ${val("/" + sw)}.`);
  },
});

function showPrices(u: IUrsamuSDK): void {
  u.send([
    bar(),
    hdr("CHOP SHOP -- BLACK MARKET RATES"),
    bar(),
    row("HARVEST (extract)", `${acc("mall")} ${val("500 eb")}  ${acc("clinic")} ${val("1000 eb")}  ${acc("hospital")} ${val("2000 eb")}`),
    row("INSTALL (implant)",  `${acc("mall")} ${val("200 eb")}  ${acc("clinic")} ${val("500 eb")}   ${acc("hospital")} ${val("1500 eb")}`),
    div(),
    ...wrap("All operations take 2-8 hours. Failure risks complications.", 76),
    `  ${ERR}Black market. No records, no recourse.`,
    bar(),
  ].join("\r\n"));
}

async function showQueue(u: IUrsamuSDK): Promise<void> {
  const isAdmin = u.me.flags.has("admin") || u.me.flags.has("wizard");
  const jobs = await chopDB.find(isAdmin ? undefined : { medtechId: u.me.id });
  if (jobs.length === 0) { u.send(`${ARR}No chop shop jobs in queue.`); return; }
  const lines: string[] = [
    bar(),
    hdr("CHOP SHOP -- JOB QUEUE"),
    bar(),
  ];
  for (const j of jobs) {
    const ready = Date.now() >= j.completesAt;
    const status = j.completed
      ? dim("[done]")
      : j.success === false
      ? `${ERR.trimEnd()} [failed]`
      : ready
      ? `%cg[READY]%cn`
      : `%cy[in progress]%cn`;
    lines.push(`  ${val(j.id.slice(0, 8))}  ${lbl(j.procedure)}  ${acc(j.cyberwareName ?? "")}  ${dim("on")} ${j.patientName}  ${status}`);
  }
  lines.push(bar());
  u.send(lines.join("\r\n"));
}

async function harvestCyberware(u: IUrsamuSDK, cpr: ICPRCharacter, arg: string): Promise<void> {
  const surgerySkill = cpr.skills["surgery"] ?? 0;
  if (surgerySkill < 1) {
    u.send(`${ERR}You have no Surgery skill. Allocate Medicine role points to Surgery first.`); return;
  }

  const [targetName, cwName] = arg.split("=").map((s) => s.trim());
  if (!targetName || !cwName) { u.send(`${ARR}Usage: ${val("+chopshop/harvest <target>=<cyberware>")}`); return; }

  const target = await u.util.target(u.me, targetName || "", false);
  if (!target) { u.send(`${ERR}Target not found nearby.`); return; }
  if (!(await u.canEdit(u.me, target))) { u.send(`${ERR}Permission denied.`); return; }

  const targetCpr = target.state.cpr as ICPRCharacter | undefined;
  if (!targetCpr?.chargenComplete) { u.send(`${ERR}Target has no character.`); return; }

  const normalize = (s: string) => s.toLowerCase().replace(/[\s_]+/g, " ").trim();
  const cwNameNorm = normalize(cwName);
  const installed = targetCpr.cyberware.find((cw) => normalize(cw.name) === cwNameNorm);
  if (!installed) { u.send(`${ERR}${val(u.util.displayName(target, u.me))} doesn't have ${val(cwName)} installed.`); return; }

  const activeJobs = await chopDB.find({ medtechId: u.me.id });
  const incompleteJobs = activeJobs.filter((j: IChopshopQueue) => !j.completed);
  const inferTier = (dv: number): string => dv >= 17 ? "hospital" : dv >= 15 ? "clinic" : "mall";
  const usedSlots = incompleteJobs.reduce(
    (sum: number, j: IChopshopQueue) => sum + chopshopSlotCost(inferTier(j.surgeryDV)),
    0,
  );
  const queueCap = medtechQueueCapacity(cpr.roleRank);
  const jobCost = chopshopSlotCost(installed.installType);
  if (usedSlots + jobCost > queueCap) {
    u.send([
      `${ERR}Queue capacity reached.`,
      row("RANK",     val(String(cpr.roleRank))),
      row("CAPACITY", `${val(String(usedSlots))} / ${val(String(queueCap))} ${dim("slots used")}`),
      `  ${ARR}${val("+chopshop/queue")} ${dim("to see your active jobs.")}`,
    ].join("\r\n")); return;
  }

  const cost = harvestCost(installed.installType);
  if (targetCpr.eurodollars < cost) {
    u.send(`${ERR}Harvest costs ${val(cost + " eb")}. Target has ${dim(targetCpr.eurodollars + " eb")}.`); return;
  }

  // Surgery roll: TECH + Surgery + 1d10 vs tier DV
  const dv = tierDV(installed.installType);
  const roll = Math.floor(Math.random() * 10) + 1;
  const total = cpr.stats.tech + surgerySkill + roll;
  const success = total >= dv;

  await u.db.modify(target.id, "$inc", { "state.cpr.eurodollars": -cost });
  await u.db.modify(u.me.id, "$inc", { "state.cpr.eurodollars": cost });

  const resultLines = tbl(
    [rc("ROLL", 6), rc("TOTAL", 6), rc("DV", 4), rc("RESULT", 12)],
    [[rv(roll), rv(total), rv(dv), success ? acc("SUCCESS") : bad("FAILED")]],
  );

  if (!success) {
    u.send([
      div(),
      ...resultLines,
      `  ${ERR}Harvest failed -- Chrome damaged -- unusable.`,
      div(),
    ].join("\r\n"));
    return;
  }

  // Remove from target
  const newList = targetCpr.cyberware.filter((cw) => normalize(cw.name) !== cwNameNorm);
  await u.db.modify(target.id, "$set", { "state.cpr.cyberware": newList });

  // Queue harvest job as completed (item is now extracted)
  const job: IChopshopQueue = {
    id: crypto.randomUUID(),
    medtechId: u.me.id,
    medtechName: u.util.displayName(u.me, u.me),
    patientId: target.id,
    patientName: u.util.displayName(target, u.me),
    procedure: "harvest",
    cyberwareName: installed.name,
    cyberwareHl: installed.hl,
    surgeryDV: dv,
    surgerySkill: String(surgerySkill),
    scheduledAt: Date.now(),
    completesAt: Date.now(),
    completed: true,
    success: true,
  };
  await chopDB.create(job);
  await emitChopshopHarvest(u.me.id, u.util.displayName(u.me, u.me), target.id, u.util.displayName(target, u.me), installed.name, true);

  u.send([
    div(),
    `  ${OK}Chrome extracted: ${val(installed.name.replace(/_/g, " "))}`,
    ...resultLines,
    row("FROM",   val(u.util.displayName(target, u.me))),
    row("COST",   val(cost + " eb")),
    div(),
  ].join("\r\n"));
  u.send(`${ERR}Your ${val(installed.name.replace(/_/g, " "))} has been removed.`, target.id);
}

async function installHarvested(u: IUrsamuSDK, cpr: ICPRCharacter, arg: string): Promise<void> {
  const surgerySkill = cpr.skills["surgery"] ?? 0;
  if (surgerySkill < 1) {
    u.send(`${ERR}You have no Surgery skill. Allocate Medicine role points to Surgery first.`); return;
  }

  const [targetName, cwName] = arg.split("=").map((s) => s.trim());
  if (!targetName || !cwName) { u.send(`${ARR}Usage: ${val("+chopshop/install <target>=<cyberware>")}`); return; }

  const target = await u.util.target(u.me, targetName || "", false);
  if (!target) { u.send(`${ERR}Target not found nearby.`); return; }

  const targetCpr = target.state.cpr as ICPRCharacter | undefined;
  if (!targetCpr?.chargenComplete) { u.send(`${ERR}Target has no character.`); return; }

  const def = getCyberware(cwName);
  if (!def) { u.send(`${ERR}Unknown chrome ${val(cwName)}.`); return; }

  if (def.installType === "hospital" && surgerySkill < 7) {
    u.send(`${ERR}Hospital-tier chrome requires Surgery 7+. Your skill: ${val(String(surgerySkill))}.`); return;
  }
  if (def.installType === "clinic" && surgerySkill < 4) {
    u.send(`${ERR}Clinic-tier chrome requires Surgery 4+. Your skill: ${val(String(surgerySkill))}.`); return;
  }

  const cost = installCost(def.installType);
  if (targetCpr.eurodollars < cost) {
    u.send(`${ERR}Installation costs ${val(cost + " eb")}. Target has ${dim(targetCpr.eurodollars + " eb")}.`); return;
  }

  const dv = tierDV(def.installType);
  const roll = Math.floor(Math.random() * 10) + 1;
  const total = cpr.stats.tech + surgerySkill + roll;
  const success = total >= dv;

  const resultLines = tbl(
    [rc("ROLL", 6), rc("TOTAL", 6), rc("DV", 4), rc("RESULT", 12)],
    [[rv(roll), rv(total), rv(dv), success ? acc("SUCCESS") : bad("FAILED")]],
  );

  await u.db.modify(target.id, "$inc", { "state.cpr.eurodollars": -cost });
  await u.db.modify(u.me.id, "$inc", { "state.cpr.eurodollars": cost });

  if (!success) {
    u.send([
      div(),
      ...resultLines,
      `  ${ERR}Installation failed -- Chrome rejected. Patient charged for materials.`,
      div(),
    ].join("\r\n"));
    return;
  }

  const hlAmount = def.hlRoll ? rollVariableHL(def.hlRoll) : def.hl;
  const { newHL, newEMP } = applyHumanityLoss(targetCpr, hlAmount);
  const newCW: ICyberware = {
    id: crypto.randomUUID(), name: def.name, category: def.category,
    hl: hlAmount, installType: def.installType, installedAt: Date.now(),
    installedBy: u.me.id, notes: "Chop shop installation",
  };
  const updatedChar = { ...targetCpr, humanityLoss: newHL, stats: { ...targetCpr.stats, emp: newEMP } };
  const recalced = recalcDerived({ ...updatedChar, cyberware: [...targetCpr.cyberware, newCW] });

  await u.db.modify(target.id, "$set", {
    "state.cpr.cyberware": recalced.cyberware,
    "state.cpr.humanityLoss": recalced.humanityLoss,
    "state.cpr.stats": recalced.stats,
  });
  await emitChopshopInstallComplete(u.me.id, u.util.displayName(u.me, u.me), target.id, u.util.displayName(target, u.me), def.name, true);

  u.send([
    div(),
    `  ${OK}Chrome installed: ${val(def.name.replace(/_/g, " "))}`,
    ...resultLines,
    row("PATIENT",        val(u.util.displayName(target, u.me))),
    row("HUMANITY LOSS",  `${lbl("HL:")} ${val(hlAmount)}`),
    row("COST",           val(cost + " eb")),
    div(),
  ].join("\r\n"));
  u.send(`  ${OK}${u.util.displayName(u.me, target)} installs ${val(def.name.replace(/_/g, " "))}. ${lbl("HL:")} ${val(hlAmount)}`, target.id);
}

async function completeJob(u: IUrsamuSDK, idPrefix: string): Promise<void> {
  const isAdmin = u.me.flags.has("admin") || u.me.flags.has("wizard");
  if (!isAdmin) { u.send(`${ERR}Admin only.`); return; }
  if (!idPrefix) { u.send(`${ARR}Provide job ID.`); return; }
  const jobs = await chopDB.find({});
  const job = jobs.find((j) => j.id.startsWith(idPrefix));
  if (!job) { u.send(`${ERR}Job not found.`); return; }
  await chopDB.update({ id: job.id }, { ...job, completed: true });
  u.send(`${OK}Job ${val(job.id.slice(0, 8))} marked complete.`);
}

const harvestCost = (t: string) => t === "mall" ? 500 : t === "clinic" ? 1000 : 2000;
const installCost = (t: string) => t === "mall" ? 200 : t === "clinic" ? 500 : 1500;

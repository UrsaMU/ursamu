/**
 * +bench / +repair -- Tech offline workshop and item repair commands.
 */
import { addCmd, DBO } from "@ursamu/mush";
import type { IUrsamuSDK } from "@ursamu/mush";
import type { ICPRCharacter, IBench, IRepairJob, IGearItem } from "../db/schemas.ts";
import { techRepairSpeed } from "../engine/roleCapacity.ts";
import { bar, div, hdr, val, acc, dim, ARR, ERR, OK, row, tbl } from "./chargen.ts";

export const benchDB  = new DBO<IBench>("cpr.benches");
export const repairDB = new DBO<IRepairJob>("cpr.repairs");

const BENCH_DURATION_MS = 8 * 60 * 60 * 1000; // 8h default

const DEFAULT_RATES = { weapon: 50, armor: 30, gear: 200 };

const isStaff = (u: IUrsamuSDK) =>
  u.me.flags.has("admin") || u.me.flags.has("wizard") || u.me.flags.has("superuser");

function msToHours(ms: number): string {
  if (ms <= 0) return "ready";
  const h = Math.ceil(ms / (60 * 60 * 1000));
  if (h < 24) return `${h}h`;
  const d = Math.ceil(ms / (24 * 60 * 60 * 1000));
  return `${d}d`;
}

// ─── +bench command ──────────────────────────────────────────────────────────

addCmd({
  name: "+bench",
  pattern: /^\+bench(?:\/(open|close|rates|queue|collect))?\s*(.*)/i,
  lock: "connected",
  category: "Cyberpunk RED",
  help: `+bench[/<switch>] [<argument>]  -- Tech offline repair workshop.

Switches:
  /open [name]              Open a repair bench here (Tech role only).
                            Permanent if you own/can-edit the room.
  /close                    Close your active bench.
  /rates <type>=<cost>      Set your repair rate.
                            type: weapon | armor | gear
                            weapon/armor cost = eb per SP restored.
                            gear cost = flat fee.
  /queue                    View your pending repair jobs.
  /collect                  (clients) Pick up a completed repair.

Examples:
  +bench/open Nomad's Garage   Open a named bench.
  +bench/open                  Open an unnamed bench.
  +bench/close                 Close your bench.
  +bench/rates weapon=60       Set weapon rate to 60eb/SP.
  +bench/rates gear=150        Set gear flat fee to 150eb.
  +bench/queue                 View all pending jobs.
  +bench/collect               Pick up a completed repair.`,

  exec: async (u: IUrsamuSDK) => {
    const sw  = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const arg = u.util.stripSubs(u.cmd.args[1] ?? "").trim();
    const cpr = u.me.state.cpr as ICPRCharacter | undefined;
    if (!cpr?.chargenComplete) { u.send(`${ERR}No character found.`); return; }

    if (sw === "open")    { await openBench(u, cpr, arg); return; }
    if (sw === "close")   { await closeBench(u); return; }
    if (sw === "rates")   { await setRates(u, arg); return; }
    if (sw === "queue")   { await showQueue(u); return; }
    if (sw === "collect") { await collectRepair(u, cpr); return; }
    u.send(`${ERR}Unknown switch. See ${val("+help bench")}.`);
  },
});

// ─── Handlers ────────────────────────────────────────────────────────────────

async function openBench(
  u: IUrsamuSDK, cpr: ICPRCharacter, arg: string,
): Promise<void> {
  if (cpr.role !== "tech" && !isStaff(u)) {
    u.send(`${ERR}Only Techs can open a repair bench.`); return;
  }
  const existing = await benchDB.find({ techId: u.me.id, roomId: u.here.id, active: true });
  if (existing.length > 0) {
    u.send(`${ERR}You already have an open bench here.`); return;
  }
  const established = await u.canEdit(u.me, u.here);
  const expiresAt = established ? Number.MAX_SAFE_INTEGER : Date.now() + BENCH_DURATION_MS;
  const benchName = arg.slice(0, 40) || `${u.util.displayName(u.me, u.me)}'s Bench`;

  const bench: IBench = {
    id: crypto.randomUUID(),
    techId:    u.me.id,
    techName:  u.util.displayName(u.me, u.me),
    roomId:    u.here.id,
    benchName,
    techSkill: cpr.roleRank,
    openedAt:  Date.now(),
    expiresAt,
    active:    true,
    established,
    rates:     { ...DEFAULT_RATES },
  };

  await benchDB.create(bench);

  const statusStr = established
    ? `${acc("ESTABLISHED")} ${dim("— permanent")}`
    : `${dim("temporary —")} ${val(msToHours(expiresAt - Date.now()))} ${dim("remaining")}`;

  u.send([
    bar(),
    hdr("BENCH OPEN"),
    bar(),
    row("NAME",   val(benchName)),
    row("STATUS", statusStr),
    row("RANK",   val(String(cpr.roleRank))),
    row("WEAPON", `${val(String(bench.rates.weapon))} ${dim("eb/SP")}`),
    row("ARMOR",  `${val(String(bench.rates.armor))} ${dim("eb/SP")}`),
    row("GEAR",   `${val(String(bench.rates.gear))} ${dim("eb flat")}`),
    div(),
    `  ${ARR}${val("+bench/rates weapon=<n>")}  ${dim("to adjust rates")}`,
    bar(),
  ].join("\r\n"));
  u.here.broadcast?.(`${ARR}${acc(benchName)} is open. ${dim("+repair <item>")} to queue work.`);
}

async function closeBench(u: IUrsamuSDK): Promise<void> {
  const benches = await benchDB.find({ techId: u.me.id, active: true });
  if (benches.length === 0) { u.send(`${ERR}You have no open bench.`); return; }
  const bench = benches[0] as IBench;
  await benchDB.update({ id: bench.id }, { ...bench, active: false });
  u.send(`${OK}${val(bench.benchName)} is closed.`);
  u.here.broadcast?.(`${dim("[BENCH]")} ${acc(bench.benchName)} has closed.`);
}

async function setRates(u: IUrsamuSDK, arg: string): Promise<void> {
  const benches = await benchDB.find({ techId: u.me.id, active: true });
  if (benches.length === 0) { u.send(`${ERR}You have no open bench.`); return; }
  const bench = benches[0] as IBench;
  const eqIdx = arg.indexOf("=");
  if (eqIdx < 0) {
    u.send(`${ERR}Usage: ${val("+bench/rates <type>=<cost>")}`); return;
  }
  const type = arg.slice(0, eqIdx).trim().toLowerCase();
  const cost = parseInt(arg.slice(eqIdx + 1).trim(), 10);
  if (isNaN(cost) || cost < 1) {
    u.send(`${ERR}Cost must be a positive number.`); return;
  }
  if (type !== "weapon" && type !== "armor" && type !== "gear") {
    u.send(`${ERR}Type must be ${val("weapon")}, ${val("armor")}, or ${val("gear")}.`); return;
  }
  const newRates = { ...bench.rates, [type]: cost };
  await benchDB.update({ id: bench.id }, { ...bench, rates: newRates });
  const suffix = type === "gear" ? dim("eb flat") : dim("eb/SP");
  u.send(`${OK}${val(bench.benchName)} — ${lbl(type)} rate set to ${val(String(cost))} ${suffix}.`);
}

function lbl(s: string): string {
  return `%cm${s.toUpperCase()}%cn`;
}

async function showQueue(u: IUrsamuSDK): Promise<void> {
  const jobs = await repairDB.find({ techId: u.me.id, completed: false });
  if (jobs.length === 0) {
    u.send(`${ARR}No pending repair jobs.`); return;
  }
  const rv = (n: string | number) => val(String(n));
  const rc = (label: string, width: number) =>
    ({ label, width, align: "right" as const });
  const lc = (label: string, width: number) => ({ label, width });
  const now = Date.now();
  const rows = (jobs as IRepairJob[]).map((j) => [
    j.clientName.slice(0, 16),
    j.itemName.slice(0, 18),
    j.spToRestore != null ? rv(j.spToRestore) : dim("flat"),
    rv(j.costPaid),
    j.completesAt <= now ? acc("READY") : dim(msToHours(j.completesAt - now)),
  ]);
  u.send([
    div(),
    `  ${lbl("REPAIR QUEUE")}`,
    ...tbl(
      [lc("CLIENT", 16), lc("ITEM", 18), rc("SP", 4), rc("COST", 6), lc("ETA", 8)],
      rows,
    ),
    div(),
  ].join("\r\n"));
}

async function collectRepair(u: IUrsamuSDK, cpr: ICPRCharacter): Promise<void> {
  const bench = await findBenchInRoom(u);
  if (!bench) { u.send(`${ERR}No active bench in this room.`); return; }
  const jobs = (await repairDB.find({
    benchId: bench.id, clientId: u.me.id, pickedUp: false,
  })) as IRepairJob[];
  const ready = jobs.filter((j) => j.completesAt <= Date.now());
  if (ready.length === 0) {
    const pending = jobs.filter((j) => j.completesAt > Date.now());
    if (pending.length > 0) {
      const soonest = Math.min(...pending.map((j) => j.completesAt));
      u.send(`${ERR}Not ready yet. Soonest: ${dim(msToHours(soonest - Date.now()))}`);
    } else {
      u.send(`${ERR}No completed repairs to pick up.`);
    }
    return;
  }
  for (const job of ready) {
    await applyRepair(u, cpr, job);
    await repairDB.update({ id: job.id }, { ...job, pickedUp: true });
  }
  u.send(`${OK}Picked up ${val(String(ready.length))} repair(s).`);
}

async function applyRepair(
  u: IUrsamuSDK, cpr: ICPRCharacter, job: IRepairJob,
): Promise<void> {
  const sp = job.spToRestore ?? 0;
  if (job.itemType === "weapon" || job.itemType === "armor") {
    const gear: IGearItem[] = Array.isArray(cpr.gear) ? cpr.gear : [];
    const idx = gear.findIndex((g) => g.name === job.itemName);
    if (idx < 0) return;
    const item = gear[idx];
    if (job.itemType === "armor" && "currentSp" in item) {
      const patched = { ...item } as IGearItem & { currentSp?: number };
      patched.currentSp = Math.min(
        (patched.currentSp ?? 0) + sp,
        (patched as IGearItem & { sp?: number }).sp ?? 999,
      );
      const newGear = [...gear.slice(0, idx), patched, ...gear.slice(idx + 1)];
      await u.db.modify(u.me.id, "$set", { "state.cpr.gear": newGear });
    }
    if (job.itemType === "weapon") {
      // weapons in CPR don't have tracked HP; repair just confirms
    }
  }
}

// ─── +repair command ─────────────────────────────────────────────────────────

addCmd({
  name: "+repair",
  pattern: /^\+repair\s+(.*)/i,
  lock: "connected",
  category: "Cyberpunk RED",
  help: `+repair <item>  -- Submit an item to the bench in this room for repair.

<item>  Name or ID prefix of a gear item you're carrying.
        Weapon / armor: cost = SP-to-restore × bench rate.
        Gear: flat fee set by the Tech.

EB is paid immediately. Pick up when ready with +bench/collect.

Examples:
  +repair Assault Rifle     Queue your rifle for SP restoration.
  +repair Light Armorjack   Queue your armor for repair.`,

  exec: async (u: IUrsamuSDK) => {
    const arg = u.util.stripSubs(u.cmd.args[0] ?? "").trim();
    if (!arg) { u.send(`${ERR}Usage: ${val("+repair <item>")}`); return; }
    const cpr = u.me.state.cpr as ICPRCharacter | undefined;
    if (!cpr?.chargenComplete) { u.send(`${ERR}No character found.`); return; }
    const bench = await findBenchInRoom(u);
    if (!bench) { u.send(`${ERR}No active bench in this room.`); return; }
    const gear: IGearItem[] = Array.isArray(cpr.gear) ? cpr.gear : [];
    const item = findGearItem(gear, arg);
    if (!item) { u.send(`${ERR}Item ${val('"' + arg + '"')} not found in your gear.`); return; }
    const { sp, cost } = calcCost(bench, item);
    if (sp === 0 && item.type !== "gear") {
      u.send(`${ERR}${val(item.name)} is not damaged.`); return;
    }
    if (cpr.eurodollars < cost) {
      u.send(`${ERR}Insufficient funds. Need ${val(String(cost))} eb, have ${val(String(cpr.eurodollars))} eb.`);
      return;
    }
    const msPerSp = techRepairSpeed(bench.techSkill);
    const duration = item.type === "gear" ? msPerSp : sp * msPerSp;
    const now = Date.now();
    const job: IRepairJob = {
      id:          crypto.randomUUID(),
      benchId:     bench.id,
      techId:      bench.techId,
      techName:    bench.techName,
      clientId:    u.me.id,
      clientName:  u.util.displayName(u.me, u.me),
      itemName:    item.name,
      itemType:    item.type as IRepairJob["itemType"],
      spToRestore: sp > 0 ? sp : undefined,
      costPaid:    cost,
      queuedAt:    now,
      completesAt: now + duration,
      completed:   false,
      pickedUp:    false,
    };
    await repairDB.create(job);
    await u.db.modify(u.me.id, "$inc", { "state.cpr.eurodollars": -cost });
    await u.db.modify(bench.techId, "$inc", { "state.cpr.eurodollars": cost });
    u.send([
      div(),
      `  ${lbl("REPAIR QUEUED")}  ${val(item.name)}`,
      row("SP RESTORE", sp > 0 ? val(String(sp)) : dim("n/a")),
      row("COST",       `${val(String(cost))} ${dim("eb — paid")}`),
      row("ETA",        dim(msToHours(duration))),
      row("PICKUP",     `${ARR}${val("+bench/collect")} ${dim("when ready")}`),
      div(),
    ].join("\r\n"));
    u.send(`${OK}${val(u.util.displayName(u.me, u.me))} queued ${val(item.name)}.`, bench.techId);
  },
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function findBenchInRoom(u: IUrsamuSDK): Promise<IBench | null> {
  const benches = (await benchDB.find({
    roomId: u.here.id, active: true,
  })) as IBench[];
  const now = Date.now();
  return benches.find((b) => b.expiresAt > now) ?? null;
}

function findGearItem(gear: IGearItem[], query: string): IGearItem | undefined {
  const q = query.toLowerCase();
  return (
    gear.find((g) => g.id.startsWith(q)) ??
    gear.find((g) => g.name.toLowerCase().includes(q))
  );
}

function calcCost(bench: IBench, item: IGearItem): { sp: number; cost: number } {
  if (item.type === "gear") {
    return { sp: 0, cost: bench.rates.gear };
  }
  const itemAsArmor = item as IGearItem & { sp?: number; currentSp?: number };
  if (item.type === "armor" && itemAsArmor.sp != null && itemAsArmor.currentSp != null) {
    const sp = Math.max(0, itemAsArmor.sp - itemAsArmor.currentSp);
    return { sp, cost: sp * bench.rates.armor };
  }
  if (item.type === "weapon") {
    const itemAsWeapon = item as IGearItem & { currentHp?: number; maxHp?: number };
    if (itemAsWeapon.maxHp != null && itemAsWeapon.currentHp != null) {
      const sp = Math.max(0, itemAsWeapon.maxHp - itemAsWeapon.currentHp);
      return { sp, cost: sp * bench.rates.weapon };
    }
    return { sp: 0, cost: 0 };
  }
  return { sp: 0, cost: bench.rates.gear };
}

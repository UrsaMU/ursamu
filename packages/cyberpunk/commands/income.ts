/**
 * +income -- Role-based passive income collection and status
 */
import { addCmd, DBO } from "@ursamu/mush";
import type { IUrsamuSDK } from "@ursamu/mush";
import type { ICPRCharacter } from "../db/schemas.ts";
import type { IIncomeRecord } from "../db/schemas.ts";
import {
  bar, hdr, val, acc, dim, ylw, ARR, ERR, row,
} from "./chargen.ts";

// ─── Income config ────────────────────────────────────────────────────────────

type IncomeCfg = {
  source: string;
  period: "weekly" | "monthly";
  basePerRank: number;
};

const WEEK_MS  = 7 * 24 * 60 * 60 * 1000;
const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

const INCOME_TABLE: Record<string, IncomeCfg> = {
  exec:      { source: "Corporate Salary",         period: "weekly",  basePerRank: 500 },
  rockerboy: { source: "Recording Royalties",      period: "monthly", basePerRank: 300 },
  media:     { source: "Data Broker / Publishing", period: "weekly",  basePerRank: 200 },
  fixer:     { source: "Passive Deal Cut",         period: "weekly",  basePerRank: 150 },
  lawman:    { source: "Government Stipend",        period: "weekly",  basePerRank: 100 },
  nomad:     { source: "Pack Income Share",         period: "weekly",  basePerRank: 100 },
};

const incomeDB = new DBO<IIncomeRecord>("cpr.income_records");

// ─── Helpers ──────────────────────────────────────────────────────────────────

function periodMs(period: "weekly" | "monthly"): number {
  return period === "weekly" ? WEEK_MS : MONTH_MS;
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const days = Math.floor(diff / (24 * 60 * 60 * 1000));
  if (days === 0) return "today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

function timeUntil(ts: number): string {
  const diff = ts - Date.now();
  if (diff <= 0) return "available now!";
  const days  = Math.floor(diff / (24 * 60 * 60 * 1000));
  const hours = Math.floor((diff % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  if (days > 0) return `${days}d ${hours}h`;
  return `${hours}h`;
}

/** Calculate payout, capped at 2× normal to prevent infinite stacking. */
function calcPayout(cfg: IncomeCfg, rank: number, dueAt: number): number {
  const normal    = cfg.basePerRank * rank;
  const elapsed   = Date.now() - dueAt + periodMs(cfg.period);
  const periods   = Math.floor(elapsed / periodMs(cfg.period));
  return Math.min(normal * Math.max(1, periods), normal * 2);
}

// ─── Status display ───────────────────────────────────────────────────────────

async function showStatus(u: IUrsamuSDK, cpr: ICPRCharacter): Promise<void> {
  const cfg = INCOME_TABLE[cpr.role];
  if (!cfg) {
    u.send([
      bar(),
      hdr("PASSIVE INCOME"),
      bar(),
      row("ROLE",   val(cpr.role)),
      row("STATUS", dim("No passive income for this role.")),
      bar(),
    ].join("\r\n"));
    return;
  }

  const dueAt    = (cpr.roleData.incomeDueAt as number | undefined) ?? 0;
  const ready    = Date.now() >= dueAt;
  const amount   = cfg.basePerRank * cpr.roleRank;
  const history  = await incomeDB.find({ playerId: u.me.id });
  const recent   = history
    .sort((a, b) => b.paidAt - a.paidAt)
    .slice(0, 3);

  const nextLine = ready
    ? acc("available now!")
    : val(timeUntil(dueAt));

  const lines = [
    bar(),
    hdr(`${cpr.role.toUpperCase()} INCOME — ${u.util.displayName(u.me, u.me).toUpperCase()}`),
    bar(),
    row("ROLE",       val(cpr.role)),
    row("SOURCE",     val(cfg.source)),
    row("RANK",       val(String(cpr.roleRank))),
    row(`PER ${cfg.period.toUpperCase()}`, val(`${amount.toLocaleString()} eb`)),
    row("NEXT PAYOUT", nextLine),
  ];

  if (recent.length > 0) {
    lines.push(bar());
    for (const rec of recent) {
      lines.push(row(timeAgo(rec.paidAt), val(`+${rec.amount.toLocaleString()} eb`)));
    }
  }

  lines.push(bar());
  if (ready) {
    lines.push(`  ${ARR}${val("+income/collect")}  ${dim("-- collect your payout")}`);
  }

  u.send(lines.join("\r\n"));
}

// ─── Collect ──────────────────────────────────────────────────────────────────

async function doCollect(u: IUrsamuSDK, cpr: ICPRCharacter): Promise<void> {
  const cfg = INCOME_TABLE[cpr.role];
  if (!cfg) {
    u.send(`${ERR}Your role (${val(cpr.role)}) has no passive income.`);
    return;
  }

  const dueAt = (cpr.roleData.incomeDueAt as number | undefined) ?? 0;
  if (Date.now() < dueAt) {
    u.send(`${ERR}Next payout in ${ylw(timeUntil(dueAt))}.`);
    return;
  }

  const amount  = calcPayout(cfg, cpr.roleRank, dueAt);
  const nextDue = Date.now() + periodMs(cfg.period);

  await u.db.modify(u.me.id, "$inc", { "state.cpr.eurodollars": amount });
  await u.db.modify(u.me.id, "$set", { "state.cpr.roleData.incomeDueAt": nextDue });

  await incomeDB.create({
    id:         crypto.randomUUID(),
    playerId:   u.me.id,
    playerName: u.util.displayName(u.me, u.me),
    role:       cpr.role,
    roleRank:   cpr.roleRank,
    amount,
    period:     cfg.period,
    paidAt:     Date.now(),
    nextDueAt:  nextDue,
  });

  u.send([
    bar(),
    hdr("INCOME COLLECTED"),
    bar(),
    row("SOURCE",  val(cfg.source)),
    row("AMOUNT",  acc(`+${amount.toLocaleString()} eb`)),
    row("NEXT",    dim(timeUntil(nextDue))),
    bar(),
  ].join("\r\n"));
}

// ─── Command ──────────────────────────────────────────────────────────────────

addCmd({
  name: "+income",
  pattern: /^\+income(?:\/(collect|status))?\s*(.*)/i,
  lock: "connected",
  category: "Cyberpunk RED",
  help: `+income[/<switch>]  -- View or collect your role-based passive income.

Switches:
  /status     Show income status, source, and recent history. (default)
  /collect    Collect available passive income.

Examples:
  +income           Check your income status.
  +income/status    Same as above.
  +income/collect   Collect your payout when available.`,

  exec: async (u: IUrsamuSDK) => {
    const sw  = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const cpr = u.me.state.cpr as ICPRCharacter | undefined;
    if (!cpr?.chargenComplete) { u.send(`${ERR}No character found.`); return; }

    if (sw === "collect") {
      await doCollect(u, cpr);
      return;
    }

    await showStatus(u, cpr);
  },
});

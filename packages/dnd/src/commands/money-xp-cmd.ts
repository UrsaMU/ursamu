/**
 * +money, +xp — purse and experience.
 */
import { addCmd, type IUrsamuSDK } from "@ursamu/ursamu";
import {
  getXpRequired,
  addXp,
} from "../stats/rules.ts";
import {
  addCoins,
  spendCoins,
  formatPurse,
  type Coin,
} from "../stats/currency.ts";
import {
  sheetOf,
  saveSheet,
  isStaff,
  resolveTarget,
  purseNeedsSeed,
} from "./rules-helpers.ts";

const COINS: Coin[] = ["cp", "sp", "ep", "gp", "pp"];

function parseCoinArg(
  raw: string,
): { amount: number; coin: Coin } | null {
  const m = raw.trim().match(
    /^(-?\d+)\s*(cp|sp|ep|gp|pp)?$/i,
  );
  if (!m) return null;
  const amount = parseInt(m[1], 10);
  const coin = (m[2] || "gp").toLowerCase() as Coin;
  if (!COINS.includes(coin)) return null;
  return { amount, coin };
}

addCmd({
  name: "+money",
  pattern: /^\+(?:money|coins|purse)(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Dnd",
  help:
    `+money [<player>] — Show purse.\n` +
    `+money/add <n>[cp|sp|ep|gp|pp] [=player]\n` +
    `+money/spend <n>[coin] [=player]`,
  exec: async (u: IUrsamuSDK) => {
    const sw = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const arg = u.util.stripSubs(u.cmd.args[1] ?? "").trim();

    let coinPart = arg;
    let whoRaw = "";
    if (arg.includes("=")) {
      const eq = arg.indexOf("=");
      coinPart = arg.slice(0, eq).trim();
      whoRaw = arg.slice(eq + 1).trim();
    }

    const target = await resolveTarget(u, whoRaw);
    if (!target) return;
    let s = sheetOf(target);
    if (!s) {
      u.send("No character sheet.");
      return;
    }
    const name = u.util.displayName(target, u.me);

    // Persist gold→purse seed so shops can spend (no wipe needed).
    // deno-lint-ignore no-explicit-any
    const rawDnd = (target.state as any)?.dnd;
    if (purseNeedsSeed(rawDnd) && (s.gold || 0) > 0) {
      await saveSheet(u, target, s);
    }

    if (!sw || sw === "view") {
      u.send(
        `%ch%cyMONEY>>%cn ${name}: ${formatPurse(s)} ` +
          `(~${s.gold} gp).`,
      );
      return;
    }

    if (!(await u.canEdit(u.me, target)) && !isStaff(u)) {
      u.send("Permission denied.");
      return;
    }

    const parsed = parseCoinArg(coinPart);
    if (!parsed || parsed.amount === 0) {
      u.send(
        "Usage: +money/add 10gp  or  +money/spend 5sp",
      );
      return;
    }

    if (sw === "add" || sw === "give") {
      s = addCoins(s, parsed.amount, parsed.coin);
      await saveSheet(u, target, s);
      u.send(
        `%ch%cyMONEY>>%cn ${name}: +${parsed.amount} ` +
          `${parsed.coin} → ${formatPurse(s)}.`,
      );
      return;
    }

    if (sw === "spend" || sw === "pay" || sw === "remove") {
      const next = spendCoins(
        s,
        Math.abs(parsed.amount),
        parsed.coin,
      );
      if (!next) {
        u.send(`${name} cannot afford that.`);
        return;
      }
      await saveSheet(u, target, next);
      u.send(
        `%ch%cyMONEY>>%cn ${name}: -` +
          `${Math.abs(parsed.amount)} ${parsed.coin} → ` +
          `${formatPurse(next)}.`,
      );
      return;
    }

    u.send("Switches: /add /spend");
  },
});

addCmd({
  name: "+xp",
  pattern: /^\+xp(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Dnd",
  help:
    `+xp [<player>] — Show XP and next level threshold.\n` +
    `+xp/award <n> [=player] — Grant XP (staff).\n` +
    `+xp/set <n> [=player] — Set XP total (staff).`,
  exec: async (u: IUrsamuSDK) => {
    const sw = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const arg = u.util.stripSubs(u.cmd.args[1] ?? "").trim();

    let numPart = arg;
    let whoRaw = "";
    if (arg.includes("=")) {
      const eq = arg.indexOf("=");
      numPart = arg.slice(0, eq).trim();
      whoRaw = arg.slice(eq + 1).trim();
    }

    const target = await resolveTarget(u, whoRaw);
    if (!target) return;
    let s = sheetOf(target);
    if (!s) {
      u.send("No character sheet.");
      return;
    }
    const name = u.util.displayName(target, u.me);
    const next = getXpRequired((s.level || 1) + 1);
    const nextStr = Number.isFinite(next)
      ? String(next)
      : "max";

    if (!sw || sw === "view") {
      u.send(
        `%ch%cyXP>>%cn ${name}: %ch${s.xp || 0}%cn XP ` +
          `(level ${s.level}, next at ${nextStr}).`,
      );
      return;
    }

    if (!isStaff(u)) {
      u.send("Only staff can award or set XP.");
      return;
    }

    const n = parseInt(numPart, 10);
    if (isNaN(n) || n < 0) {
      u.send("Amount must be a non-negative integer.");
      return;
    }

    if (sw === "award" || sw === "add" || sw === "give") {
      s = addXp(s, n);
      await saveSheet(u, target, s);
      u.send(
        `%ch%cyXP>>%cn ${name} gains %ch${n}%cn XP ` +
          `(now ${s.xp}).`,
      );
      return;
    }

    if (sw === "set") {
      s = { ...s, xp: n };
      await saveSheet(u, target, s);
      u.send(
        `%ch%cyXP>>%cn ${name} XP set to %ch${n}%cn.`,
      );
      return;
    }

    u.send("Switches: /award /set");
  },
});

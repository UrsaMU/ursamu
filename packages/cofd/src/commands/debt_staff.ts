// Staff +debt/call and /clear.

import type { IUrsamuSDK } from "@ursamu/ursamu";
import {
  findDebt,
  setDebtStatus,
} from "../market/index.ts";
import {
  getSheet,
  isStaff,
  persistSheet,
} from "./market_helpers.ts";

export async function debtCall(
  u: IUrsamuSDK,
  rest: string,
): Promise<void> {
  if (!isStaff(u.me)) {
    u.send("Permission denied. Staff only.");
    return;
  }
  const eq = rest.indexOf("=");
  if (eq < 0) {
    u.send("Usage: +debt/call <player> <id>=<demand>");
    return;
  }
  const left = rest.slice(0, eq).trim();
  const demand = rest.slice(eq + 1).trim();
  const bits = left.split(/\s+/);
  let target = u.me;
  let id = left;
  if (bits.length >= 2) {
    const who = bits[0];
    id = bits.slice(1).join(" ");
    const t = await u.util.target(u.me, who, true);
    if (!t) {
      u.send(`No player matches '${who}'.`);
      return;
    }
    target = t;
  }
  const sheet = getSheet(target);
  if (!sheet) {
    u.send("No sheet.");
    return;
  }
  const d = findDebt(sheet, id);
  if (!d || d.status === "paid") {
    u.send("No open debt matches that id.");
    return;
  }
  const r = setDebtStatus(sheet, d.id, "called", {
    calledAt: Date.now(),
    calledNote: demand.slice(0, 200),
  });
  if (!r.debt) {
    u.send("Could not update debt.");
    return;
  }
  await persistSheet(u, target.id, r.sheet);
  u.send(
    `Called debt ${d.id.slice(-8)} on ` +
      `${u.util.displayName(target, u.me)}.`,
  );
  u.send(
    `%chA Goblin Debt is called!%cn ${demand}`,
    target.id,
  );
}

export async function debtClear(
  u: IUrsamuSDK,
  rest: string,
): Promise<void> {
  if (!isStaff(u.me)) {
    u.send("Permission denied.");
    return;
  }
  const bits = rest.trim().split(/\s+/);
  if (bits.length < 2) {
    u.send("Usage: +debt/clear <player> <id>");
    return;
  }
  const t = await u.util.target(u.me, bits[0], true);
  if (!t) {
    u.send("Player not found.");
    return;
  }
  const sheet = getSheet(t);
  if (!sheet) {
    u.send("No sheet.");
    return;
  }
  const d = findDebt(sheet, bits[1]);
  if (!d) {
    u.send("Debt not found.");
    return;
  }
  const r = setDebtStatus(sheet, d.id, "paid", {
    paidAt: Date.now(),
  });
  await persistSheet(u, t.id, r.sheet);
  u.send(`Cleared debt ${d.id.slice(-8)}.`);
}

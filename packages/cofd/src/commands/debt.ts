// +debt — list / pay Goblin Debts.

import { divider, type IUrsamuSDK } from "@ursamu/ursamu";
import {
  findDebt,
  openDebts,
  readDebts,
  setDebtStatus,
  totalOpenDebt,
} from "../market/index.ts";
import {
  getSheet,
  isStaff,
  persistSheet,
  requireChangeling,
} from "./market_helpers.ts";
import { debtCall, debtClear } from "./debt_staff.ts";

export async function debtCommand(
  u: IUrsamuSDK,
): Promise<void> {
  const sw = (u.cmd.args[0] ?? "").toLowerCase().trim();
  const rest = u.util.stripSubs(u.cmd.args[1] ?? "").trim();
  return await debtExec(
    u,
    sw ? `${sw} ${rest}`.trim() : rest,
  );
}

/** Shared with +market/debt. */
export async function debtExec(
  u: IUrsamuSDK,
  rest: string,
): Promise<void> {
  const parts = rest.trim().split(/\s+/);
  const sw = (parts[0] ?? "").toLowerCase();
  const arg = parts.slice(1).join(" ").trim();

  if (!sw || sw === "list" || sw === "status") {
    return await debtList(u, arg);
  }
  if (sw === "pay") return await debtPay(u, arg);
  if (sw === "call") return await debtCall(u, rest);
  if (sw === "clear") return await debtClear(u, arg);
  return await debtList(u, rest);
}

async function debtList(
  u: IUrsamuSDK,
  who: string,
): Promise<void> {
  let target = u.me;
  if (who && isStaff(u.me)) {
    const t = await u.util.target(u.me, who, true);
    if (!t) {
      u.send(`No player matches '${who}'.`);
      return;
    }
    target = t;
  }
  const sheet = getSheet(target);
  const err = requireChangeling(sheet, "Goblin Debts");
  if (err && target.id === u.me.id) {
    u.send(err);
    return;
  }
  if (!sheet) {
    u.send("No sheet.");
    return;
  }
  const debts = readDebts(sheet);
  const open = openDebts(sheet);
  const lines = [
    await divider("G O B L I N  D E B T"),
    `  Open severity total: ${totalOpenDebt(sheet)} ` +
      `(${open.length} active)`,
  ];
  if (debts.length === 0) {
    lines.push("  (none)");
  } else {
    for (const d of debts) {
      if (d.status === "paid") continue;
      const tag = d.status === "called"
        ? "%crCALLED%cn"
        : "%cyopen%cn";
      lines.push(
        `  ${tag} ${d.id.slice(-8)}  sev ${d.amount}  ` +
          `to ${d.to}`,
      );
      lines.push(`    ${d.note.slice(0, 60)}`);
      if (d.calledNote) {
        lines.push(
          `    Call: ${d.calledNote.slice(0, 50)}`,
        );
      }
    }
  }
  lines.push(
    "  +debt/pay <id>   mark paid (RP service done)",
  );
  if (isStaff(u.me)) {
    lines.push(
      "  +debt/call <id>=<demand>  staff call-in",
    );
  }
  u.send(lines.join("\n"));
}

async function debtPay(
  u: IUrsamuSDK,
  rest: string,
): Promise<void> {
  const sheet = getSheet(u.me);
  const err = requireChangeling(sheet, "Goblin Debts");
  if (err) {
    u.send(err);
    return;
  }
  const id = rest.trim();
  if (!id) {
    u.send("Usage: +debt/pay <debt-id>");
    return;
  }
  const d = findDebt(sheet!, id);
  if (!d || d.status === "paid") {
    u.send("No open debt matches that id.");
    return;
  }
  const r = setDebtStatus(sheet!, d.id, "paid", {
    paidAt: Date.now(),
  });
  if (!r.debt) {
    u.send("Could not update debt.");
    return;
  }
  await persistSheet(u, u.me.id, r.sheet);
  u.send(
    `Debt %cy${d.id.slice(-8)}%cn marked paid. ` +
      "The market remembers… or forgets.",
  );
}

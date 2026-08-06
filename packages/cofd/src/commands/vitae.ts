// +vitae — Vampire Vitae pool: view, spend, heal, blush, boost.

import type { IUrsamuSDK } from "@ursamu/ursamu";
import {
  isVampireSheet,
  spendVitae,
  gainVitae,
  healWithVitae,
  blushOfLife,
  boostPhysical,
  vitaeStatusLine,
  vitaeMax,
} from "../vitae/index.ts";
import {
  migrateSheet,
  refreshAdvantages,
  type CofdSheet,
} from "../stats/index.ts";

function getSheet(obj: {
  state?: Record<string, unknown>;
}): CofdSheet | null {
  const raw = obj.state?.cofd;
  if (!raw || typeof raw !== "object") return null;
  return migrateSheet(raw);
}

async function persist(
  u: IUrsamuSDK,
  id: string,
  sheet: CofdSheet,
): Promise<void> {
  await u.db.modify(id, "$set", {
    "data.cofd": refreshAdvantages(sheet),
  });
}

function isStaff(u: IUrsamuSDK): boolean {
  const f = u.me.flags;
  return (
    f.has("admin") ||
    f.has("wizard") ||
    f.has("superuser") ||
    f.has("builder")
  );
}

async function viewVitae(u: IUrsamuSDK, arg: string) {
  const target = arg
    ? await u.util.target(u.me, arg, true)
    : u.me;
  if (!target) {
    u.send(`Player '${arg}' not found.`);
    return;
  }
  const sheet = getSheet(target);
  if (!sheet || !isVampireSheet(sheet)) {
    u.send("No vampire sheet on that character.");
    return;
  }
  const who = target.id === u.me.id
    ? "Your"
    : `${u.util.displayName(target, u.me)}'s`;
  u.send(`${who} ${vitaeStatusLine(sheet)}`);
  if (sheet.customFields?.blush === "active") {
    u.send("  Blush of Life is active.");
  }
}

export async function vitaeExec(u: IUrsamuSDK): Promise<void> {
  const sw = (u.cmd.args[0] ?? "").toLowerCase().trim();
  const rest = u.util.stripSubs(u.cmd.args[1] ?? "").trim();

  if (!sw) {
    await viewVitae(u, rest);
    return;
  }

  const sheet = getSheet(u.me);
  if (!sheet || !isVampireSheet(sheet)) {
    u.send("Only vampires use +vitae.");
    return;
  }

  if (sw === "spend") {
    const n = parseInt(rest, 10);
    if (Number.isNaN(n) || n < 1) {
      u.send("Usage: +vitae/spend <n>");
      return;
    }
    const r = spendVitae(sheet, n);
    if (!r.ok || !r.sheet) {
      u.send(r.reason ?? "Spend failed.");
      return;
    }
    await persist(u, u.me.id, r.sheet);
    u.send(r.lines.join("\n"));
    return;
  }

  if (sw === "gain" || sw === "set") {
    if (!isStaff(u)) {
      u.send("Staff only: +vitae/gain or /set.");
      return;
    }
    // gain N [for player]  |  set N [for player]
    let name = "";
    let raw = rest;
    const fi = rest.toLowerCase().lastIndexOf(" for ");
    if (fi >= 0) {
      name = rest.slice(fi + 5).trim();
      raw = rest.slice(0, fi).trim();
    }
    const n = parseInt(raw, 10);
    if (Number.isNaN(n)) {
      u.send(`Usage: +vitae/${sw} <n> [for <player>]`);
      return;
    }
    const target = name
      ? await u.util.target(u.me, name, true)
      : u.me;
    if (!target) {
      u.send(`Player '${name}' not found.`);
      return;
    }
    const ts = getSheet(target);
    if (!ts || !isVampireSheet(ts)) {
      u.send("Target has no vampire sheet.");
      return;
    }
    if (sw === "set") {
      const max = vitaeMax(ts);
      const v = Math.max(0, Math.min(max, n));
      const next = { ...ts, energyCurrent: v };
      await persist(u, target.id, next);
      u.send(
        `Vitae set to ${v}/${max} on ` +
          `${u.util.displayName(target, u.me)}.`,
      );
      return;
    }
    const r = gainVitae(ts, n, "staff grant");
    if (!r.ok || !r.sheet) {
      u.send(r.reason ?? "Gain failed.");
      return;
    }
    await persist(u, target.id, r.sheet);
    u.send(r.lines.join("\n"));
    return;
  }

  if (sw === "heal" || sw === "heal-bash" || sw === "heal-bashing") {
    const r = healWithVitae(sheet, "bashing");
    if (!r.ok || !r.sheet) {
      u.send(r.reason ?? "Heal failed.");
      return;
    }
    await persist(u, u.me.id, r.sheet);
    u.send(r.lines.join("\n"));
    return;
  }

  if (sw === "heal-lethal") {
    const r = healWithVitae(sheet, "lethal");
    if (!r.ok || !r.sheet) {
      u.send(r.reason ?? "Heal failed.");
      return;
    }
    await persist(u, u.me.id, r.sheet);
    u.send(r.lines.join("\n"));
    return;
  }

  if (sw === "blush") {
    const r = blushOfLife(sheet);
    if (!r.ok || !r.sheet) {
      u.send(r.reason ?? "Blush failed.");
      return;
    }
    await persist(u, u.me.id, r.sheet);
    u.send(r.lines.join("\n"));
    return;
  }

  if (sw === "boost") {
    const attr = rest || "strength";
    const r = boostPhysical(sheet, attr);
    if (!r.ok || !r.sheet) {
      u.send(r.reason ?? "Boost failed.");
      return;
    }
    await persist(u, u.me.id, r.sheet);
    u.send(r.lines.join("\n"));
    return;
  }

  u.send(
    "Unknown +vitae switch. Try /spend, /heal, " +
      "/heal-lethal, /blush, /boost, /gain.",
  );
}

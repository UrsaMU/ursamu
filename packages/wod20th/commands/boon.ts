// commands/boon.ts -- +boon Kindred favor economy.

import { addCmd } from "@ursamu/mush";
import type { IUrsamuSDK } from "@ursamu/mush";
import { findById, findByPlayer } from "../db/charDb.ts";
import {
  createBoon,
  findBoonById,
  findBoonsFor,
  parseBoonWeight,
  saveBoon,
} from "../db/boonDb.ts";
import { footer, header } from "../core/format.ts";

function isStaff(u: IUrsamuSDK): boolean {
  return u.me.flags.has("admin") ||
    u.me.flags.has("wizard") ||
    u.me.flags.has("superuser");
}

addCmd({
  name: "+boon",
  pattern: /^\+boon(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Vampire",
  help: `+boon[/switch] [<args>]  -- Blood boons (favors).

SYNTAX
  +boon                        Your open boons.
  +boon/owe <who>=<weight> <reason>
                               Record that you owe them.
  +boon/pay <id>               Mark a boon paid (creditor or staff).
  +boon/void <id>              (Staff) Void a boon.
  +boon/weights                List weight tiers.

Weights: trivial, minor, major, life

SEE ALSO: +help coterie, +help domain`,

  exec: async (u: IUrsamuSDK) => {
    const sw = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const arg = u.util.stripSubs(u.cmd.args[1] ?? "").trim();

    if (sw === "weights") {
      u.send(
        [
          header("Boon Weights"),
          "  trivial  -- small favor, information",
          "  minor    -- significant aid, risk",
          "  major    -- life-changing, great danger",
          "  life     -- saved from Final Death",
          footer(),
        ].join("%r"),
      );
      return;
    }

    const char = await findByPlayer(u.me.id);
    if (!char) {
      u.send("No character on file.");
      return;
    }

    if (sw === "owe") {
      // who=weight reason...
      const eq = arg.indexOf("=");
      if (eq < 1) {
        u.send("Usage: +boon/owe <who>=<weight> <reason>");
        return;
      }
      const who = arg.slice(0, eq).trim();
      const rest = arg.slice(eq + 1).trim();
      const sp = rest.indexOf(" ");
      const wRaw = sp < 0 ? rest : rest.slice(0, sp);
      const reason = sp < 0 ? "(no reason)" : rest.slice(sp + 1).trim();
      const weight = parseBoonWeight(wRaw);
      if (!weight) {
        u.send("Weight must be trivial|minor|major|life.");
        return;
      }
      const t = await u.util.target(u.me, who, true);
      if (!t) {
        u.send("Creditor not found.");
        return;
      }
      const tc = await findByPlayer(t.id);
      if (!tc) {
        u.send("Creditor has no character.");
        return;
      }
      if (tc.id === char.id) {
        u.send("Cannot owe yourself.");
        return;
      }
      const b = await createBoon(char.id, tc.id, weight, reason);
      u.send(
        `%cgBoon recorded:%cn you owe ` +
          `${u.util.displayName(t, u.me)} a %ch${weight}%cn boon ` +
          `(id ${b.id.slice(0, 8)}...).`,
      );
      u.send(
        `You are owed a ${weight} boon by ${
          u.util.displayName(u.me, t)
        }.`,
        t.id,
      );
      return;
    }

    if (sw === "pay" || sw === "void") {
      if (!arg) {
        u.send(`Usage: +boon/${sw} <boon-id-prefix>`);
        return;
      }
      const all = await findBoonsFor(char.id);
      const b = all.find((x) => x.id.startsWith(arg)) ??
        await findBoonById(arg);
      if (!b) {
        // staff may void any
        if (isStaff(u) && arg.length >= 8) {
          const maybe = await findBoonById(arg);
          if (maybe) {
            maybe.status = sw === "void" ? "void" : "paid";
            if (sw === "pay") maybe.paidAt = Date.now();
            await saveBoon(maybe);
            u.send(`Boon ${maybe.id.slice(0, 8)} -> ${maybe.status}.`);
            return;
          }
        }
        u.send("Boon not found.");
        return;
      }
      if (sw === "void" && !isStaff(u)) {
        u.send("%crStaff only.%cn");
        return;
      }
      if (
        sw === "pay" &&
        b.creditorId !== char.id &&
        !isStaff(u)
      ) {
        u.send("Only the creditor (or staff) can mark a boon paid.");
        return;
      }
      if (b.status !== "open") {
        u.send(`Boon is already ${b.status}.`);
        return;
      }
      b.status = sw === "void" ? "void" : "paid";
      if (sw === "pay") b.paidAt = Date.now();
      await saveBoon(b);
      u.send(`Boon ${b.id.slice(0, 8)} marked ${b.status}.`);
      return;
    }

    if (sw && sw !== "show" && sw !== "list") {
      u.send(`Unknown switch /${sw}. Try +help boon.`);
      return;
    }

    const boons = await findBoonsFor(char.id);
    const open = boons.filter((b) => b.status === "open");
    const lines = [header("Boons")];
    if (!open.length) {
      lines.push("  (No open boons.)");
    } else {
      for (const b of open) {
        const deb = await findById(b.debtorId);
        const cre = await findById(b.creditorId);
        const dn = deb?.moniker || deb?.fullName || b.debtorId.slice(0, 8);
        const cn = cre?.moniker || cre?.fullName || b.creditorId.slice(0, 8);
        const side = b.debtorId === char.id ? "OWE" : "OWED";
        lines.push(
          `  [${b.id.slice(0, 8)}] %ch${side}%cn ` +
            `${b.weight.padEnd(8)} ${dn} -> ${cn}`,
        );
        lines.push(`           ${b.reason}`);
      }
    }
    lines.push("  %cx+boon/owe who=minor reason%cn");
    lines.push(footer());
    u.send(lines.join("%r"));
  },
});

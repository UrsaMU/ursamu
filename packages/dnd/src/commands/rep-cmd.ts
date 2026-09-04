/**
 * +rep — faction reputation + unlock titles.
 */
import { addCmd, type IUrsamuSDK } from "@ursamu/mush";
import {
  FACTIONS,
  formatRepLine,
  readRep,
  repDiscount,
} from "../world/reputation.ts";
import {
  formatUnlocks,
  hireDiscountFromRep,
  titleFor,
} from "../world/unlocks.ts";

function isStaff(u: IUrsamuSDK): boolean {
  return u.me.flags.has("admin") ||
    u.me.flags.has("wizard") ||
    u.me.flags.has("superuser");
}

addCmd({
  name: "+rep",
  pattern: /^\+rep(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Dnd",
  help:
    `+rep — Standing, titles, unlocks.\n` +
    `+rep/unlocks — Title track per faction.\n` +
    `Shop: +5/10/25 → 5/10/20% off. Hire discounts too.\n` +
    `Earn: +bounty/turnin, +caravan/deliver.\n` +
    `Staff: +rep/set <faction>=<n> [player]`,
  exec: async (u: IUrsamuSDK) => {
    const sw = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const arg = u.util.stripSubs(u.cmd.args[1] ?? "").trim();

    if (sw === "set" && isStaff(u)) {
      const eq = arg.indexOf("=");
      if (eq < 0) {
        u.send("Usage: +rep/set <faction>=<n> [player]");
        return;
      }
      const fac = arg.slice(0, eq).trim().toLowerCase();
      const rest = arg.slice(eq + 1).trim();
      const parts = rest.split(/\s+/);
      const n = parseInt(parts[0] ?? "", 10);
      const who = parts.slice(1).join(" ");
      if (!FACTIONS[fac] || isNaN(n)) {
        u.send("Bad faction or number.");
        return;
      }
      let target = u.me;
      if (who) {
        const t = await u.util.target(u.me, who, true);
        if (!t) {
          u.send("Not found.");
          return;
        }
        target = t;
      }
      // deno-lint-ignore no-explicit-any
      const rep = readRep((target as any).state);
      rep[fac] = Math.max(-50, Math.min(100, n));
      await u.db.modify(target.id, "$set", {
        "data.dndRep": rep,
      });
      u.send(
        `%ch%cyREP>>%cn ${target.name} ${fac}=${rep[fac]} ` +
          `(${titleFor(fac, rep[fac]!)})`,
      );
      return;
    }

    const rep = readRep(u.me.state);

    if (sw === "unlocks" || sw === "titles") {
      u.send("%ch%cyREP>>%cn Unlocks:");
      for (const l of formatUnlocks(rep)) u.send(l);
      const hd = hireDiscountFromRep(rep);
      if (hd > 0) {
        u.send(
          `  Hire discount now: ${Math.round(hd * 100)}%`,
        );
      }
      return;
    }

    u.send(`%ch%cyREP>>%cn ${formatRepLine(rep)}`);
    for (const f of Object.values(FACTIONS)) {
      const n = rep[f.slug] ?? 0;
      const d = repDiscount(n);
      const title = titleFor(f.slug, n);
      u.send(
        `  ${f.name.padEnd(12)} ${String(n).padStart(3)}  ` +
          `${title}` +
          (d ? `  shop -${Math.round(d * 100)}%` : ""),
      );
    }
    u.send(
      "Titles: +rep/unlocks · Earn: bounties, caravans",
    );
  },
});

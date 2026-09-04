/**
 * +eb, +lifestyle, +drug -- Economy, Lifestyle, and Drug Commands
 */
import { addCmd } from "@ursamu/mush";
import type { IUrsamuSDK } from "@ursamu/mush";
import type { ICPRCharacter } from "../db/schemas.ts";
import { LIFESTYLES } from "../data/lifestyles.ts";
import { applyDrug, pruneExpiredEffects, isDrugActive, purgeAllDrugEffects } from "../engine/economy.ts";
import { getDrug } from "../data/drugs.ts";
import { emitLifestylePaid, emitDrugEffectApplied } from "../engine/emitters.ts";
import { parsePositiveInt } from "../engine/validation.ts";
import { bar, div, hdr, lbl, val, acc, dim, ARR, ERR, OK, row, wrap, grid } from "./chargen.ts";

// -- +eb -----------------------------------------------------------------------

addCmd({
  name: "+eb",
  pattern: /^\+eb(?:\/(pay|give|receive))?\s*(.*)/i,
  lock: "connected",
  category: "Cyberpunk RED",
  help: `+eb[/<switch>] [<argument>]  -- Manage your eddies.

Switches:
  /pay <target>=<amount>     Wire eddies to another player.
  /give <target>=<amount>    (Admin) Inject eddies into an account.
  /receive <amount>          (Admin) Add eddies to yourself.

Examples:
  +eb                        Check your current balance.
  +eb/pay Rogue=500          Wire 500 eb to Rogue.
  +eb/give Player=1000       (Admin) Drop 1000 eb into Player's account.`,

  exec: async (u: IUrsamuSDK) => {
    const sw = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const arg = u.util.stripSubs(u.cmd.args[1] ?? "").trim();
    const cpr = u.me.state.cpr as ICPRCharacter | undefined;
    if (!cpr?.chargenComplete) { u.send(`${ERR}No character found.`); return; }

    if (!sw) {
      u.send([
        bar(),
        hdr("ACCOUNT BALANCE"),
        bar(),
        row("HANDLE",  val(u.util.displayName(u.me, u.me))),
        row("EDDIES",  `${val(cpr.eurodollars.toLocaleString())} ${dim("eb")}`),
        bar(),
      ].join("\r\n"));
      return;
    }

    if (sw === "pay") {
      const [targetName, amtStr] = arg.split("=");
      const amount = parseInt(amtStr, 10);
      if (!targetName || isNaN(amount) || amount < 1) {
        u.send(`${ERR}Usage: ${val("+eb/pay <target>=<amount>")}`); return;
      }
      if (cpr.eurodollars < amount) {
        u.send(`${ERR}Insufficient funds. You have ${val(cpr.eurodollars.toLocaleString())} ${dim("eb")}.`); return;
      }

      const target = await u.util.target(u.me, targetName.trim(), false);
      if (!target) { u.send(`${ERR}Target not found nearby.`); return; }
      const targetCpr = target.state.cpr as ICPRCharacter | undefined;
      if (!targetCpr?.chargenComplete) {
        u.send(`${ERR}${u.util.displayName(target, u.me)} has no active account.`); return;
      }

      await u.db.modify(u.me.id, "$inc", { "state.cpr.eurodollars": -amount });
      await u.db.modify(target.id, "$inc", { "state.cpr.eurodollars": amount });
      u.send(`${OK}Wired ${val(amount.toLocaleString())} ${dim("eb")} to ${acc(u.util.displayName(target, u.me))}.`);
      u.send(`${OK}${acc(u.util.displayName(u.me, target))} wired you ${val(amount.toLocaleString())} ${dim("eb")}.`, target.id);
      return;
    }

    const isAdmin = u.me.flags.has("admin") || u.me.flags.has("wizard");
    if (!isAdmin) { u.send(`${ERR}Only admins can use that switch.`); return; }

    if (sw === "give") {
      const [targetName, amtStr] = arg.split("=");
      const amount = parsePositiveInt(amtStr ?? "");
      if (!targetName || amount === null) {
        u.send(`${ERR}Usage: ${val("+eb/give <target>=<amount>")}  ${dim("(amount must be a positive integer)")}`); return;
      }
      const target = await u.util.target(u.me, targetName.trim(), true);
      if (!target) { u.send(`${ERR}Target not found.`); return; }
      await u.db.modify(target.id, "$inc", { "state.cpr.eurodollars": amount });
      u.send(`${OK}Injected ${val(amount.toLocaleString())} ${dim("eb")} into ${acc(u.util.displayName(target, u.me))}'s account.`);
      return;
    }

    if (sw === "receive") {
      const amount = parsePositiveInt(arg);
      if (amount === null) {
        u.send(`${ERR}Usage: ${val("+eb/receive <amount>")}  ${dim("(amount must be a positive integer)")}`); return;
      }
      await u.db.modify(u.me.id, "$inc", { "state.cpr.eurodollars": amount });
      u.send(`${OK}${val("+" + amount.toLocaleString())} ${dim("eb")} -- new balance: ${val((cpr.eurodollars + amount).toLocaleString())} ${dim("eb")}`);
    }
  },
});

// -- +lifestyle ----------------------------------------------------------------

addCmd({
  name: "+lifestyle",
  pattern: /^\+lifestyle(?:\/(pay|set|view))?\s*(.*)/i,
  lock: "connected",
  category: "Cyberpunk RED",
  help: `+lifestyle[/<switch>] [<tier>]  -- Manage your monthly lifestyle.

Switches:
  /view              Show current lifestyle and due date.
  /set <tier>        Change lifestyle tier.
  /pay               Pay this month's lifestyle cost.

Tiers: kibble, streetrat, good_prepak, moderate, corporate, luxury

Examples:
  +lifestyle/view            Check lifestyle status.
  +lifestyle/set moderate    Switch to moderate lifestyle.
  +lifestyle/pay             Pay this month's rent.`,

  exec: async (u: IUrsamuSDK) => {
    const sw = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const arg = u.util.stripSubs(u.cmd.args[1] ?? "").trim();
    const cpr = u.me.state.cpr as ICPRCharacter | undefined;
    if (!cpr?.chargenComplete) { u.send(`${ERR}No character found.`); return; }

    if (!sw || sw === "view") {
      const ls = LIFESTYLES.find((l) => l.name === cpr.lifestyle?.tier);
      if (!ls) {
        u.send(`${ARR}No lifestyle set. Use ${val("+lifestyle/set <tier>")} to choose one.`); return;
      }
      const dueDate = cpr.lifestyle ? new Date(cpr.lifestyle.nextDueDate).toLocaleDateString() : "N/A";
      const overdue = cpr.lifestyle ? Date.now() >= cpr.lifestyle.nextDueDate : false;
      u.send([
        bar(),
        hdr("LIFESTYLE STATUS"),
        bar(),
        row("TIER",      val(ls.displayName)),
        row("MONTHLY",   `${val(ls.monthlyCostEb.toLocaleString())} ${dim("eb/month")}`),
        row("NEXT DUE",  overdue
          ? `${val(dueDate)} %cr[OVERDUE]%cn`
          : val(dueDate)),
        bar(),
      ].join("\r\n"));
      return;
    }

    if (sw === "set") {
      const ls = LIFESTYLES.find((l) => l.name === arg.toLowerCase());
      if (!ls) {
        u.send(`${ERR}Unknown tier. Valid: ${LIFESTYLES.map((l) => acc(l.name)).join(dim(", "))}`); return;
      }
      const nextDueDate = Date.now() + 30 * 24 * 60 * 60 * 1000;
      await u.db.modify(u.me.id, "$set", { "state.cpr.lifestyle": { tier: ls.name, nextDueDate } });
      u.send(`${OK}Lifestyle set to ${val(ls.displayName)}. First payment due in ${dim("30 days")}.`);
      return;
    }

    if (sw === "pay") {
      if (!cpr.lifestyle) { u.send(`${ERR}No lifestyle set.`); return; }
      const ls = LIFESTYLES.find((l) => l.name === cpr.lifestyle!.tier);
      if (!ls) { u.send(`${ERR}Lifestyle data not found.`); return; }
      if (cpr.eurodollars < ls.monthlyCostEb) {
        u.send(`${ERR}Insufficient funds. ${val(ls.monthlyCostEb.toLocaleString())} ${dim("eb")} required, you have ${val(cpr.eurodollars.toLocaleString())} ${dim("eb")}.`); return;
      }
      const nextDueDate = Date.now() + 30 * 24 * 60 * 60 * 1000;
      await u.db.modify(u.me.id, "$inc", { "state.cpr.eurodollars": -ls.monthlyCostEb });
      await u.db.modify(u.me.id, "$set", { "state.cpr.lifestyle.nextDueDate": nextDueDate });
      await emitLifestylePaid(u.me, ls.name, ls.monthlyCostEb);
      u.send(`${OK}Paid ${val(ls.monthlyCostEb.toLocaleString())} ${dim("eb")} for ${val(ls.displayName)} lifestyle. Next due in ${dim("30 days")}.`);
    }
  },
});

// -- +drug ---------------------------------------------------------------------

addCmd({
  name: "+drug",
  pattern: /^\+drug(?:\/(use|list|active|purge))?\s*(.*)/i,
  lock: "connected",
  category: "Cyberpunk RED",
  help: `+drug[/<switch>] [<name>]  -- Use pharmaceutical drugs.

Switches:
  /list           Show available drugs.
  /active         Show currently active drug effects.
  /use <name>     Use a drug (must have it).
  /purge          Clear all drug effects (Rapidetox only).

Examples:
  +drug/list           Browse drugs.
  +drug/use speedheal  Use Speedheal.
  +drug/active         See active effects.`,

  exec: async (u: IUrsamuSDK) => {
    const sw = (u.cmd.args[0] ?? "list").toLowerCase().trim();
    const arg = u.util.stripSubs(u.cmd.args[1] ?? "").trim().toLowerCase();
    const cpr = u.me.state.cpr as ICPRCharacter | undefined;
    if (!cpr?.chargenComplete) { u.send(`${ERR}No character found.`); return; }

    if (sw === "list") {
      const { DRUGS } = await import("../data/drugs.ts");
      const lines: string[] = [
        bar(),
        hdr("PHARMACOPEIA"),
        bar(),
      ];
      for (const d of DRUGS) {
        const dur = d.durationMs === 0 ? dim("instant") : dim(`${Math.round(d.durationMs / 60000)}m`);
        const name = acc(d.name.replace(/_/g, " "));
        lines.push(`  ${name}  [${dur}]`);
        lines.push(...wrap(d.effects, 74, "    "));
      }
      lines.push(bar());
      u.send(lines.join("\r\n")); return;
    }

    if (sw === "active") {
      const cleaned = pruneExpiredEffects(cpr.activeEffects);
      if (cleaned.length === 0) {
        u.send(`${ARR}No active drug effects.`); return;
      }
      const lines: string[] = [
        bar(),
        hdr("ACTIVE EFFECTS"),
        bar(),
      ];
      for (const eff of cleaned) {
        const remaining = Math.max(0, Math.round((eff.expiresAt - Date.now()) / 60000));
        lines.push(row(acc(eff.drug), `${dim(eff.effect)}  ${val(remaining + "m")} ${dim("remaining")}`));
      }
      lines.push(bar());
      u.send(lines.join("\r\n")); return;
    }

    if (sw === "use") {
      if (!arg) { u.send(`${ARR}Specify a drug: ${val("+drug/use <name>")}`); return; }
      const drugName = arg.replace(/ /g, "_");
      const def = getDrug(drugName);
      if (!def) {
        u.send(`${ERR}Unknown drug ${val('"' + arg + '"')}. Type ${val("+drug/list")}.`); return;
      }

      const { newEffects, isInstant, effect } = applyDrug(cpr, drugName);
      if (isInstant) {
        u.send(`${OK}You use ${val(def.name.replace(/_/g, " "))} -- ${dim(effect)}`);
        if (drugName === "rapidetox") {
          await u.db.modify(u.me.id, "$set", { "state.cpr.activeEffects": [] });
          u.send(`${OK}All drug effects purged by ${acc("Rapidetox")}.`);
        }
      } else {
        await u.db.modify(u.me.id, "$set", { "state.cpr.activeEffects": newEffects });
        await emitDrugEffectApplied(u.me, drugName, effect);
        u.send(`${OK}You use ${val(def.name.replace(/_/g, " "))} -- ${dim(effect)}`);
      }
      return;
    }

    if (sw === "purge") {
      await u.db.modify(u.me.id, "$set", { "state.cpr.activeEffects": [] });
      u.send(`${OK}All drug effects cleared.`);
    }
  },
});

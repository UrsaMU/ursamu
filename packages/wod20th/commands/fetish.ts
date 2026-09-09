// commands/fetish.ts -- +fetish for activating spirit-bound items.
//
// A fetish is an item (kind=fetish) inhabited by a spirit. Activation
// pays Gnosis (= state.fetishCost, defaults to 1) and emotes to the
// room. Per-fetish mechanics land later when a spirit-power table
// exists; v1 is parity with +gift/use.
//
// Hardening:
//   - Frenzy-gated (composure required).
//   - WtA and kinfolk only (kinfolk via Gnosis merit; plugin grants).
//   - Must be carrying the item.
//   - Spend BEFORE emit; no pose on failure.

import { addCmd, gameHooks } from "@ursamu/ursamu";
import type { IUrsamuSDK } from "@ursamu/ursamu";
import { findByPlayer, saveChar } from "../db/charDb.ts";
import { getEqMeta } from "../core/eq.ts";
import { spendPool } from "../core/pools.ts";
import { frenzyBlockMessage } from "../core/frenzyGate.ts";
import { poseRoom } from "../core/poseRoom.ts";
import { shiftedDisplayName } from "../core/displayName.ts";
import { divider, footer, header } from "../core/format.ts";
import { getSpirit } from "../splats/wta/data/spirits.ts";
import { getCharm, charmsForSpirit } from "../splats/wta/data/charms.ts";
import { rollDice } from "../core/dice.ts";
import { appliedPool } from "../core/wounds.ts";

// deno-lint-ignore no-explicit-any
type AnyObj = any;

const DEFAULT_FETISH_COST = 1;

function findInContents(holder: AnyObj, q: string): AnyObj | undefined {
  const items: AnyObj[] = Array.isArray(holder?.contents) ? holder.contents : [];
  const ql = q.toLowerCase();
  for (const it of items) {
    const raw = String(it?.state?.name ?? it?.name ?? "");
    const first = raw.split(";")[0]?.trim().toLowerCase();
    if (first === ql || raw.toLowerCase() === ql) return it;
  }
  for (const it of items) {
    const raw = String(it?.state?.name ?? it?.name ?? "").toLowerCase();
    if (raw.includes(ql)) return it;
  }
  return undefined;
}

async function resolveCarriedItem(u: IUrsamuSDK, arg: string): Promise<AnyObj | undefined> {
  const found = findInContents(u.me, arg);
  if (found) return found;
  return await u.util.target(u.me, arg, true);
}

function isCarried(u: IUrsamuSDK, item: AnyObj): boolean {
  return Array.isArray(u.me.contents) && u.me.contents.some(
    (c: AnyObj) => c?.id === item.id,
  );
}

function canUseFetishes(splat: string): boolean {
  return splat === "wta" || splat === "kinfolk";
}

async function renderList(u: IUrsamuSDK): Promise<string> {
  const items: AnyObj[] = Array.isArray(u.me.contents) ? u.me.contents : [];
  const fetishes = items.filter((it) => getEqMeta(it).kind === "fetish");
  const lines: string[] = [header("Fetishes Carried")];
  if (fetishes.length === 0) {
    lines.push("  (You are carrying no fetishes.)");
  } else {
    for (const it of fetishes) {
      const meta = getEqMeta(it);
      const name = u.util.displayName(it, u.me);
      const cost = meta.fetishCost ?? DEFAULT_FETISH_COST;
      let flag: string;
      if (meta.talen) {
        flag = meta.talenSpent ? "%crSPENT %cn" : "%cyTALEN %cn";
      } else {
        flag = meta.fetishActive ? "%cgACTIVE%cn" : "%cy-     %cn";
      }
      lines.push(`  ${flag}  %ch${name.padEnd(24)}%cn  Cost: ${cost} Gnosis`);
    }
  }
  lines.push(footer());
  return lines.join("%r");
}

async function renderInfo(u: IUrsamuSDK, item: AnyObj): Promise<string> {
  const meta = getEqMeta(item);
  const name = u.util.displayName(item, u.me);
  const cost = meta.fetishCost ?? DEFAULT_FETISH_COST;
  let stateLine: string;
  if (meta.wyrmTainted) {
    stateLine = "%crWYRM-TAINTED -- shun this item%cn";
  } else if (meta.talen) {
    stateLine = meta.talenSpent ? "%crspent (talen)%cn" : "%cytalen -- single use%cn";
  } else {
    stateLine = meta.fetishActive ? "%cgactive%cn" : "dormant";
  }
  const lines: string[] = [
    header(`Fetish: ${name}`),
    `  Cost:    ${cost} Gnosis`,
    `  State:   ${stateLine}`,
  ];
  if (meta.fetishDesc) {
    lines.push(divider("Description"));
    lines.push(`  ${meta.fetishDesc}`);
  }
  if (meta.spiritSlug) {
    const sp = getSpirit(meta.spiritSlug);
    if (sp) {
      lines.push(divider(`Bound Spirit: ${sp.name}`));
      lines.push(`  Type:        ${sp.type}`);
      lines.push(`  Rage:        ${sp.rage}    Gnosis: ${sp.gnosis}    Willpower: ${sp.willpower}    Power: ${sp.power}`);
      lines.push(`  Ban:         ${sp.ban}`);
    } else {
      lines.push(divider("Bound Spirit"));
      lines.push(`  %cy(unknown spirit slug: ${meta.spiritSlug})%cn`);
    }
  }
  lines.push(footer());
  return lines.join("%r");
}

addCmd({
  name: "+fetish",
  pattern: /^\+fetish(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Werewolf",
  help: `+fetish[/switch] [<arg>]  -- Activate spirit-bound items.

SYNTAX
  +fetish                       List fetishes you are carrying.
  +fetish/list                  Same as +fetish.
  +fetish/info <item>           Show fetish details.
  +fetish/use <item>            Activate; pays state.fetishCost (default 1).
  +fetish/deactivate <item>     Release a bound fetish.
  +fetish/charms <item>         List the bound spirit's charms.
  +fetish/charm <item>=<slug>   Invoke a charm; pays the charm's cost.

EXAMPLES
  +fetish/use klaive
  +fetish/charm spirit-stone=tracking
  +fetish/charms spirit-stone

SEE ALSO: +help fetish, +help gnosis, +help eq, +help spirit`,

  exec: async (u: IUrsamuSDK) => {
    const sw  = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const arg = u.util.stripSubs(u.cmd.args[1] ?? "").trim();

    // /list (or no switch) -- list carried fetishes.
    if (!sw || sw === "list") {
      u.send(await renderList(u));
      return;
    }

    if (!arg) { u.send(`Usage: +fetish/${sw} <item>`); return; }

    // /charm takes "<item>=<charm-slug>". Strip the charm half before
    // resolving the item; otherwise resolveCarriedItem looks for a thing
    // literally named "<item>=<charm-slug>" and falls through to "not
    // carrying" reject.
    const itemArg = sw === "charm" && arg.includes("=")
      ? arg.slice(0, arg.indexOf("=")).trim()
      : arg;

    // Resolve item first (info doesn't need char gating).
    const item = await resolveCarriedItem(u, itemArg);
    if (!item) { u.send(`You aren't carrying anything called "${itemArg}".`); return; }
    if (!isCarried(u, item)) { u.send("You can only act on what you are carrying."); return; }

    const meta = getEqMeta(item);
    if (meta.kind !== "fetish") { u.send(`${u.util.displayName(item, u.me)} is not a fetish.`); return; }

    if (sw === "info") {
      u.send(await renderInfo(u, item));
      return;
    }

    // From here on the actor's own character is required + splat-gated.
    const char = await findByPlayer(u.me.id);
    if (!char) { u.send("You have no character on file."); return; }
    if (!canUseFetishes(char.splat)) {
      u.send("Only Garou and Kinfolk with Gnosis may bind fetishes.");
      return;
    }

    // /use <item>
    if (sw === "use") {
      const block = frenzyBlockMessage(char, "activate a fetish");
      if (block) { u.send(block); return; }
      const itemName = u.util.displayName(item, u.me);
      if (meta.wyrmTainted) {
        u.send(`%cr${itemName} is Wyrm-tainted -- you will not lay hand to it.%cn`);
        return;
      }
      if (meta.talen && meta.talenSpent) {
        u.send(`%cr${itemName} has been spent.%cn`);
        return;
      }
      if (!meta.talen && meta.fetishActive) { u.send(`${itemName} is already active.`); return; }

      const cost = meta.fetishCost ?? DEFAULT_FETISH_COST;
      const spend = spendPool(char, "gnosis", cost);
      if (!spend.ok) { u.send(spend.message); return; }

      char.gnosisCurrent = spend.remaining;
      await saveChar(char);
      if (meta.talen) {
        await u.db.modify(item.id, "$set", { "state.talenSpent": true });
      } else {
        await u.db.modify(item.id, "$set", { "state.fetishActive": true });
      }

      gameHooks.emit("wod20th:fetish-used", {
        playerId: u.me.id,
        charId: char.id,
        itemId: item.id,
        cost,
      });

      const loginName = u.util.displayName(u.me, u.me);
      const seenAs = shiftedDisplayName(char, loginName);
      if (meta.talen) {
        u.send(`%cgYou invoke %ch${itemName}%cn%cg; it crumbles to dust (-%cy${cost}%cn%cg Gnosis).%cn`);
        poseRoom(u, `%cy${seenAs}%cn invokes the talen %ch${itemName}%cn; it is spent.`);
      } else {
        u.send(`%cgYou bind the spirit in %ch${itemName}%cn%cg (-%cy${cost}%cn%cg Gnosis).%cn`);
        poseRoom(u, `%cy${seenAs}%cn invokes the fetish %ch${itemName}%cn.`);
      }
      return;
    }

    // /deactivate <item>
    if (sw === "deactivate") {
      if (meta.talen) {
        u.send(`${u.util.displayName(item, u.me)} is a talen; it cannot be released.`);
        return;
      }
      if (!meta.fetishActive) { u.send(`${u.util.displayName(item, u.me)} is not active.`); return; }
      await u.db.modify(item.id, "$set", { "state.fetishActive": false });

      gameHooks.emit("wod20th:fetish-released", {
        playerId: u.me.id,
        charId: char.id,
        itemId: item.id,
      });

      const itemName = u.util.displayName(item, u.me);
      u.send(`You release ${itemName}.`);
      poseRoom(u, `${u.util.displayName(u.me, u.me)} releases the spirit in ${itemName}.`);
      return;
    }

    // /charms <item> -- list the bound spirit's charms (universal + named).
    if (sw === "charms") {
      if (meta.wyrmTainted) {
        u.send(`%cr${u.util.displayName(item, u.me)} is Wyrm-tainted -- its charms are forbidden.%cn`);
        return;
      }
      if (!meta.spiritSlug) {
        u.send(`${u.util.displayName(item, u.me)} houses no spirit; no charms.`);
        return;
      }
      const sp = getSpirit(meta.spiritSlug);
      if (!sp) { u.send(`Unknown bound spirit (slug: ${meta.spiritSlug}).`); return; }
      const charms = charmsForSpirit(sp);
      const lines: string[] = [
        header(`Charms -- ${u.util.displayName(item, u.me)} / ${sp.name}`),
      ];
      if (charms.length === 0) {
        lines.push("  (No catalog charms; flavor only.)");
      } else {
        for (const c of charms) {
          const costParts: string[] = [];
          if (c.cost?.gnosis)    costParts.push(`${c.cost.gnosis}G`);
          if (c.cost?.willpower) costParts.push(`${c.cost.willpower}W`);
          if (c.cost?.rage)      costParts.push(`${c.cost.rage}R`);
          const costTag = costParts.length ? `  [${costParts.join("/")}]` : "";
          const rollTag = c.roll ? `  (${c.roll.pool} vs ${c.roll.difficulty ?? 6})` : "";
          lines.push(`  %ch${c.name.padEnd(24)}%cn  %cw[${c.slug}]%cn${costTag}${rollTag}`);
          lines.push(`    ${c.description}`);
        }
      }
      lines.push(footer());
      u.send(lines.join("%r"));
      return;
    }

    // /charm <item>=<charm-slug> -- invoke a charm from the bound spirit.
    if (sw === "charm") {
      const block = frenzyBlockMessage(char, "invoke a charm");
      if (block) { u.send(block); return; }
      if (meta.wyrmTainted) {
        u.send(`%cr${u.util.displayName(item, u.me)} is Wyrm-tainted -- you will not invoke it.%cn`);
        return;
      }
      if (!meta.spiritSlug) {
        u.send(`${u.util.displayName(item, u.me)} houses no spirit; no charms to invoke.`);
        return;
      }
      if (meta.talen && meta.talenSpent) {
        u.send(`%cr${u.util.displayName(item, u.me)} has been spent.%cn`);
        return;
      }
      // Parse <item>=<charm-slug> from the original arg (resolveCarriedItem
      // already consumed the item half; we re-parse here).
      const eq = arg.indexOf("=");
      if (eq < 0) { u.send("Usage: +fetish/charm <item>=<charm-slug>"); return; }
      const charmSlug = arg.slice(eq + 1).trim().toLowerCase();
      if (!charmSlug) { u.send("Usage: +fetish/charm <item>=<charm-slug>"); return; }

      const sp = getSpirit(meta.spiritSlug);
      if (!sp) { u.send(`Unknown bound spirit (slug: ${meta.spiritSlug}).`); return; }
      const available = charmsForSpirit(sp);
      const def = available.find((c) => c.slug === charmSlug) ?? getCharm(charmSlug);
      if (!def) { u.send(`Unknown charm: ${charmSlug}. Try +fetish/charms ${u.util.displayName(item, u.me)}.`); return; }
      if (!available.some((c) => c.slug === def.slug)) {
        u.send(`${sp.name} does not grant ${def.name}.`);
        return;
      }

      // Pay charm cost from the user (each pool independently, fail-closed).
      const spends: Array<{ pool: "gnosis" | "willpower" | "rage"; amt: number }> = [];
      if (def.cost?.gnosis)    spends.push({ pool: "gnosis",    amt: def.cost.gnosis });
      if (def.cost?.willpower) spends.push({ pool: "willpower", amt: def.cost.willpower });
      if (def.cost?.rage)      spends.push({ pool: "rage",      amt: def.cost.rage });
      const spent: string[] = [];
      for (const s of spends) {
        const sp2 = spendPool(char, s.pool, s.amt);
        if (!sp2.ok) { u.send(sp2.message); return; }
        if (s.pool === "gnosis")    char.gnosisCurrent    = sp2.remaining;
        if (s.pool === "willpower") char.willpowerCurrent = sp2.remaining;
        if (s.pool === "rage")      char.rageCurrent      = sp2.remaining;
        spent.push(`-${s.amt} ${s.pool[0].toUpperCase() + s.pool.slice(1)}`);
      }
      await saveChar(char);

      // If the charm has a roll, roll Gnosis vs declared difficulty
      // (with wound penalty). Net successes drive narrative; mechanics
      // are descriptive per W20 -- staff arbitrates concrete effects.
      let rollLine = "";
      if (def.roll) {
        const base = Math.max(1, char.gnosis ?? 1);
        const pool = appliedPool(char, base).pool;
        const diff = Math.max(2, Math.min(10, def.roll.difficulty ?? 6));
        const roll = rollDice(pool, diff);
        rollLine = `  %cy${def.roll.pool} (${roll.pool}d vs ${diff}): ${roll.netSuccesses} net.%cn`;
      }

      // Talen consumption.
      if (meta.talen) {
        await u.db.modify(item.id, "$set", { "state.talenSpent": true });
      }

      const itemName = u.util.displayName(item, u.me);
      const costStr = spent.length ? spent.join(", ") : "no cost";
      u.send(`%cgYou invoke %ch${def.name}%cn%cg from ${itemName} (${costStr}).%cn`);
      if (rollLine) u.send(rollLine);
      const loginName = u.util.displayName(u.me, u.me);
      const seenAs = shiftedDisplayName(char, loginName);
      poseRoom(u, `%cy${seenAs}%cn invokes %ch${def.name}%cn through %ch${itemName}%cn.`);
      return;
    }

    u.send(`Unknown switch: /${sw}. See +help fetish.`);
  },
});

// commands/spirit.ts -- +spirit catalog browser for WtA totems and broods.
//
// Read-only: prints catalog entries from WTA_SPIRITS. No DB writes.

import { addCmd } from "@ursamu/ursamu";
import type { IUrsamuSDK } from "@ursamu/ursamu";
import {
  WTA_SPIRITS,
  getSpirit,
  findByType,
  SPIRIT_TYPES,
} from "../splats/wta/data/spirits.ts";
import type { ISpiritDef, SpiritType } from "../core/types.ts";
import { divider, footer, header } from "../core/format.ts";
import { findByPlayer, saveChar } from "../db/charDb.ts";
import { spendPool } from "../core/pools.ts";
import { rollDice } from "../core/dice.ts";
import { frenzyBlockMessage } from "../core/frenzyGate.ts";
import { poseRoom } from "../core/poseRoom.ts";
import { getEqMeta } from "../core/eq.ts";
import { appliedPool } from "../core/wounds.ts";

// deno-lint-ignore no-explicit-any
type AnyObj = any;

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function fmtRow(def: ISpiritDef): string {
  const tag = titleCase(def.type).padEnd(10);
  return `  ${tag} %ch${def.name.padEnd(28)}%cn  %cw[${def.slug}]%cn  R${def.rage}/G${def.gnosis}/W${def.willpower}/P${def.power}`;
}

async function renderList(filter?: SpiritType): Promise<string> {
  const lines: string[] = [
    header(filter ? `Spirits: ${titleCase(filter)}` : "Spirit Catalog"),
  ];
  const all = filter ? findByType(filter) : Object.values(WTA_SPIRITS);
  const sorted = all.slice().sort((a, b) =>
    a.type.localeCompare(b.type) || a.name.localeCompare(b.name)
  );
  if (sorted.length === 0) {
    lines.push("  (No spirits match.)");
  } else {
    for (const def of sorted) lines.push(fmtRow(def));
  }
  lines.push(footer());
  return lines.join("%r");
}

async function renderInfo(def: ISpiritDef): Promise<string> {
  const lines: string[] = [
    header(`Spirit: ${def.name}`),
    `  Slug:        ${def.slug}`,
    `  Type:        ${titleCase(def.type)}`,
    `  Rage:        ${def.rage}`,
    `  Gnosis:      ${def.gnosis}`,
    `  Willpower:   ${def.willpower}`,
    `  Power:       ${def.power}`,
  ];
  if (def.type === "totem") {
    lines.push(`  Totem Cost:  ${def.totemCost ?? "(unrated)"}`);
  }
  lines.push(divider("Charms"));
  if (def.charms.length === 0) {
    lines.push("  (none recorded)");
  } else {
    for (const c of def.charms) lines.push(`  - ${c}`);
  }
  if (def.type === "totem" && def.totemBoons && def.totemBoons.length > 0) {
    lines.push(divider("Pack Boons"));
    for (const b of def.totemBoons) lines.push(`  - ${b}`);
  }
  lines.push(divider("Ban"));
  lines.push(`  ${def.ban}`);
  if (def.notes) {
    lines.push(divider("Notes"));
    lines.push(`  ${def.notes}`);
  }
  lines.push(footer());
  return lines.join("%r");
}

addCmd({
  name: "+spirit",
  pattern: /^\+spirit(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Werewolf",
  help: `+spirit[/switch] [<arg>]  -- Browse and engage Garou spirits.

  Full help: +help spirit

Examples:
  +help spirit`,

  exec: async (u: IUrsamuSDK) => {
    const sw  = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const arg = u.util.stripSubs(u.cmd.args[1] ?? "").trim();

    if (sw === "totems") {
      u.send(await renderList("totem"));
      return;
    }

    if (!sw || sw === "list") {
      const t = arg.toLowerCase();
      if (t && !SPIRIT_TYPES.includes(t as SpiritType)) {
        u.send(`Unknown type. Use one of: ${SPIRIT_TYPES.join(", ")}.`);
        return;
      }
      u.send(await renderList((t || undefined) as SpiritType | undefined));
      return;
    }

    if (sw === "info") {
      if (!arg) { u.send("Usage: +spirit/info <slug>"); return; }
      const def = getSpirit(arg);
      if (!def) { u.send(`Unknown spirit: ${arg}`); return; }
      u.send(await renderInfo(def));
      return;
    }

    // -- interaction switches: bargain / chiminage / bind / banish ----------
    // /bind may be compound: /bind/talen.
    const swParts = sw.split("/");
    const swHead = swParts[0] ?? "";
    const swSub  = swParts[1] ?? "";

    if (swHead === "bargain" || swHead === "chiminage" || swHead === "bind" || swHead === "banish") {
      const char = await findByPlayer(u.me.id);
      if (!char) { u.send("You have no character on file."); return; }
      if (char.splat !== "wta") { u.send("Only Garou can treat with spirits."); return; }

      // Parse <slug>=<rhs>  (banish has no =rhs).
      let slug: string;
      let rhs = "";
      if (swHead === "banish") {
        slug = arg.toLowerCase().trim();
      } else {
        const eq = arg.indexOf("=");
        if (eq < 0) { u.send(`Usage: +spirit/${sw} <slug>=<arg>`); return; }
        slug = arg.slice(0, eq).trim().toLowerCase();
        rhs  = arg.slice(eq + 1).trim();
      }
      if (!slug) { u.send(`Usage: +spirit/${sw} <slug>${swHead === "banish" ? "" : "=<arg>"}`); return; }
      const def = getSpirit(slug);
      if (!def) { u.send(`Unknown spirit: ${slug}`); return; }

      const inUmbra = (u.me as AnyObj)?.state?.reality === "penumbra";

      // --- /bind  and /bind/talen ------------------------------------------
      // Canon: Rite of the Fetish (W20 p.213) -- Wits + Rituals vs 10. We
      // diverge to Gnosis vs spirit Willpower per plugin design; cost scales
      // with spirit power (Gnosis spend clamped 1..5). Talen variant is
      // half-cost (rounded up, min 1), diff+1, item is one-shot.
      if (swHead === "bind") {
        const isTalen = swSub === "talen";
        const usage = isTalen ? "+spirit/bind/talen <slug>=<item>" : "+spirit/bind <slug>=<item>";
        if (swSub && !isTalen) { u.send(`Unknown sub-switch: /${swSub}. ${usage}`); return; }
        if (!rhs) { u.send(`Usage: ${usage}`); return; }
        if ((char.rank ?? 1) < 2) {
          u.send("Spirit binding is closed to cubs; reach Rank 2 (Fostern) first.");
          return;
        }
        const rites = char.rites ?? [];
        if (!rites.includes("rite-of-the-fetish") && !rites.includes("rite-of-binding")) {
          u.send("You must know Rite of the Fetish (or Rite of Binding) to bind spirits.");
          return;
        }
        const block = frenzyBlockMessage(char, isTalen ? "forge a talen" : "bind a spirit");
        if (block) { u.send(block); return; }

        const item = await u.util.target(u.me, rhs, true);
        if (!item) { u.send(`Item not found: ${rhs}`); return; }
        const meta = getEqMeta(item);
        if (meta.kind && meta.kind !== "fetish") {
          u.send("You can only bind into a kind=fetish (or unkinded) item.");
          return;
        }
        if (meta.spiritSlug) { u.send(`${u.util.displayName(item, u.me)} already houses a spirit.`); return; }
        if (meta.wyrmTainted) { u.send(`${u.util.displayName(item, u.me)} is Wyrm-tainted -- it cannot be cleansed by binding.`); return; }

        // Cost scales with spirit. Talens spend half (rounded up), min 1.
        const fullCost = Math.max(1, Math.min(5, def.power));
        const cost = isTalen ? Math.max(1, Math.ceil(fullCost / 2)) : fullCost;
        const spend = spendPool(char, "gnosis", cost);
        if (!spend.ok) { u.send(spend.message); return; }
        char.gnosisCurrent = spend.remaining;
        await saveChar(char);

        // Roll: Gnosis pool (canon-aligned at our distance) vs spirit Willpower.
        const basePool = Math.max(1, char.gnosis ?? 1);
        const pool = appliedPool(char, basePool).pool;
        const baseDiff = def.willpower + (isTalen ? 1 : 0);
        const diff = Math.max(2, Math.min(10, baseDiff));
        const roll = rollDice(pool, diff);

        const itemName = u.util.displayName(item, u.me);

        // --- Botch path: Wyrm taint ---
        if (roll.botch) {
          await u.db.modify(item.id, "$set", {
            "state.wyrmTainted": true,
            "state.fetishDesc": "WARNING: Wyrm-bound -- shun this item",
          });
          u.send(`%crA hungry darkness answers in ${def.name}'s stead. ${itemName} is Wyrm-tainted. (-${cost} Gnosis)%cn`);
          poseRoom(u, `${u.util.displayName(u.me, u.me)} recoils from ${itemName} as something cold settles into it.`);
          return;
        }

        if (roll.netSuccesses <= 0) {
          u.send(`%cyThe spirit slips your grasp. The binding fails. (-${cost} Gnosis)%cn`);
          return;
        }

        // --- Success ---
        const descSource = (def.notes && def.notes.trim()) || def.ban || "";
        const firstSentence = descSource.split(/(?<=[.!?])\s/)[0] ?? "";
        const trimmedDesc = firstSentence.length > 80
          ? firstSentence.slice(0, 77).trimEnd() + "..."
          : firstSentence;
        const fetishDesc = `${def.name} bound -- ${trimmedDesc}`.slice(0, 200);

        // Canon: invocation cost = spirit Gnosis (clamped 1..5). Talens: 1.
        const invocationCost = isTalen
          ? 1
          : Math.max(1, Math.min(5, def.gnosis));

        const setPayload: Record<string, unknown> = {
          "state.kind": "fetish",
          "state.fetishCost": invocationCost,
          "state.fetishDesc": fetishDesc,
          "state.spiritSlug": def.slug,
        };
        if (isTalen) setPayload["state.talen"] = true;

        await u.db.modify(item.id, "$set", setPayload);

        if (isTalen) {
          u.send(`%cgYou compress %ch${def.name}%cn%cg into ${itemName} -- a one-shot talen (${roll.netSuccesses} net, -${cost} Gnosis).%cn`);
          poseRoom(u, `${u.util.displayName(u.me, u.me)} crafts a talen from ${itemName}.`);
        } else {
          u.send(`%cgYou bind %ch${def.name}%cn%cg into ${itemName} (${roll.netSuccesses} net, -${cost} Gnosis). Invocation cost: ${invocationCost} Gnosis.%cn`);
          poseRoom(u, `${u.util.displayName(u.me, u.me)} binds a spirit into ${itemName}.`);
        }
        return;
      }

      // Bargain / chiminage / banish all need Umbra presence.
      if (!inUmbra) {
        u.send("You must be in the Umbra to commune with spirits this way.");
        return;
      }
      const block = frenzyBlockMessage(char, `engage a spirit`);
      if (block) { u.send(block); return; }

      // --- /bargain ------------------------------------------------------
      if (swHead === "bargain") {
        if (!rhs) { u.send(`Usage: +spirit/bargain <slug>=<offer>`); return; }
        const spend = spendPool(char, "gnosis", 1);
        if (!spend.ok) { u.send(spend.message); return; }
        char.gnosisCurrent = spend.remaining;
        await saveChar(char);
        const basePool = Math.max(1,
          (char.attributes?.Charisma ?? 2) + (char.abilities?.Empathy ?? 0));
        const pool = appliedPool(char, basePool).pool;
        const diff = Math.max(2, Math.min(10, def.gnosis));
        const roll = rollDice(pool, diff);
        const verdict = roll.netSuccesses <= 0
          ? `%cyThe ${def.name} listens, takes the offering, gives nothing back.%cn`
          : `%cgThe ${def.name} accepts your bargain (${roll.netSuccesses} net).%cn`;
        u.send(`%cyYou speak your offer to %ch${def.name}%cn%cy: ${rhs}%cn`);
        u.send(verdict);
        poseRoom(u, `${u.util.displayName(u.me, u.me)} parleys with ${def.name}.`);
        return;
      }

      // --- /chiminage ---------------------------------------------------
      if (swHead === "chiminage") {
        if (!rhs) { u.send(`Usage: +spirit/chiminage <slug>=<gift>`); return; }
        const spend = spendPool(char, "willpower", 1);
        if (!spend.ok) { u.send(spend.message); return; }
        char.willpowerCurrent = spend.remaining;
        await saveChar(char);
        const basePool = Math.max(1,
          (char.attributes?.Charisma ?? 2) + (char.abilities?.Rituals ?? 0));
        const pool = appliedPool(char, basePool).pool;
        const diff = Math.max(2, Math.min(10, def.willpower));
        const roll = rollDice(pool, diff);
        if (roll.netSuccesses <= 0) {
          u.send(`%cyThe ${def.name} accepts the gift but stands unmoved.%cn`);
        } else {
          // Reward: net successes capped at room Gnosis (default 5), capped at spirit Gnosis.
          const reward = Math.min(roll.netSuccesses, def.gnosis);
          char.gnosisCurrent = Math.min((char.gnosis ?? 0),
            (char.gnosisCurrent ?? 0) + reward);
          await saveChar(char);
          u.send(`%cgThe ${def.name} blesses your offering. +%cy${reward}%cn%cg temp Gnosis.%cn`);
        }
        poseRoom(u, `${u.util.displayName(u.me, u.me)} offers chiminage to ${def.name}.`);
        return;
      }

      // --- /banish ------------------------------------------------------
      if (swHead === "banish") {
        const spend = spendPool(char, "willpower", 1);
        if (!spend.ok) { u.send(spend.message); return; }
        char.willpowerCurrent = spend.remaining;
        await saveChar(char);
        const basePool = Math.max(1, char.willpower ?? 1);
        const pool = appliedPool(char, basePool).pool;
        const diff = Math.max(2, Math.min(10, def.willpower));
        const roll = rollDice(pool, diff);
        if (roll.netSuccesses <= 0) {
          u.send(`%cyThe ${def.name} laughs your words off. (-1 Willpower)%cn`);
        } else {
          u.send(`%cgYou drive %ch${def.name}%cn%cg from the scene (${roll.netSuccesses} net).%cn`);
        }
        poseRoom(u, `${u.util.displayName(u.me, u.me)} commands ${def.name} from the scene.`);
        return;
      }
    }

    u.send(`Unknown switch: /${sw}. See +help spirit.`);
  },
});

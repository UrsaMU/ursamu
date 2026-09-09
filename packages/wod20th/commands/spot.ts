// commands/spot.ts -- +spot active Perception+Awareness check.
//
// Without a target: scan everyone in u.here.contents for concealed items.
// With a target:    scan just that target.
//
// Each concealed item is rolled against its concealability difficulty.
// "N" concealability resolves to auto-spot. Wound penalty applies.
import { addCmd } from "@ursamu/ursamu";
import type { IUrsamuSDK } from "@ursamu/ursamu";
import { rollDice } from "../core/dice.ts";
import { concealDifficulty } from "../core/spot.ts";
import { getEqMeta } from "../core/eq.ts";
import { findByPlayer } from "../db/charDb.ts";
import { woundPenalty } from "../core/wounds.ts";
import { frame } from "../core/format.ts";

// deno-lint-ignore no-explicit-any
type AnyObj = any;

/** Case-insensitive lookup in a Record<string, number>. */
function ciGet(obj: Record<string, number> | undefined, key: string): number {
  if (!obj) return 0;
  for (const k of Object.keys(obj)) {
    if (k.toLowerCase() === key.toLowerCase()) return obj[k] ?? 0;
  }
  return 0;
}

function concealedItemsOf(target: AnyObj): AnyObj[] {
  const items: AnyObj[] = Array.isArray(target?.contents) ? target.contents : [];
  return items.filter((it) => getEqMeta(it).concealed === true);
}

addCmd({
  name: "+spot",
  pattern: /^\+spot(?:\s+(.+))?$/i,
  lock: "connected",
  category: "General",
  help: `+spot [<target>]  -- Active Perception + Awareness check for concealed gear.

  With no target, scans everyone in the room. With a target, scans just
  that character. Each concealed item rolls against its concealability:
  Pocket(8), Jacket(7), Trenchcoat(6). "Not concealable" is auto-spotted.

SYNTAX
  +spot
  +spot <target>

EXAMPLES
  +spot           Scan the whole room.
  +spot alice     Scan Alice specifically.

SEE ALSO: +help conceal, +help wod20th`,

  exec: async (u: IUrsamuSDK) => {
    const arg = u.util.stripSubs(u.cmd.args[0] ?? "").trim();

    // -- gather targets ----------------------------------------------------
    let targets: AnyObj[];
    if (arg) {
      const t = await u.util.target(u.me, arg, false);
      if (!t) { u.send(`Target not found: ${arg}`); return; }
      targets = [t];
    } else {
      // deno-lint-ignore no-explicit-any
      const here = (u as any).here;
      const all: AnyObj[] = Array.isArray(here?.contents) ? here.contents : [];
      // Skip self -- you can't fail to notice your own gear.
      targets = all.filter((o) => o?.id && o.id !== u.me.id);
    }

    // -- compute spotter pool ---------------------------------------------
    const char = await findByPlayer(u.me.id).catch(() => null);
    let pool = 1;
    if (char) {
      const perc = ciGet(char.attributes as Record<string, number>, "Perception");
      const awar = ciGet(char.abilities as Record<string, number>, "Awareness");
      pool = perc + awar;
      const penalty = woundPenalty(char);
      pool = Math.max(0, pool - penalty);
    }
    if (pool < 1) pool = 1;

    // -- scan --------------------------------------------------------------
    let anyHidden = false;
    const lines: string[] = [];

    for (const tgt of targets) {
      const hidden = concealedItemsOf(tgt);
      if (hidden.length === 0) continue;
      anyHidden = true;
      const tname = u.util.displayName(tgt, u.me);
      lines.push(`%chSpot check:%cn vs ${tname}`);

      for (const item of hidden) {
        const display = typeof item.name === "string" ? item.name : "item";
        const diff = concealDifficulty(item);
        if (diff === "auto") {
          lines.push(`  %cgFound:%cn ${display} (auto)`);
          continue;
        }
        const roll = rollDice(pool, diff);
        if (roll.netSuccesses > 0) {
          lines.push(
            `  %cgFound:%cn ${display} (difficulty ${diff}, ${roll.netSuccesses} succ)`,
          );
        } else {
          lines.push(
            `  %cy${display} remains hidden (difficulty ${diff}, 0 succ)%cn`,
          );
        }
      }
    }

    if (!anyHidden) { u.send("Nothing hidden you can see."); return; }
    u.send(frame("Spot", lines));
  },
});

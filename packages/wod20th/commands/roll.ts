// commands/roll.ts -- +roll command for WoD20th dice pools.
// Syntax:
//   +roll <pool> [vs <diff>]        -- roll a dice pool
//   +roll/spec <pool> [vs <diff>]   -- roll with specialty (10s count double)
//   <pool> may be a number or trait expression: Strength+Brawl, Dexterity+3, etc.
import { addCmd } from "@ursamu/ursamu";
import type { IUrsamuSDK } from "@ursamu/ursamu";
import { findByPlayer } from "../db/charDb.ts";
import { rollDice, resolvePoolExpr, DEFAULT_DIFFICULTY, MAX_POOL } from "../core/dice.ts";
import { formatRoll } from "../core/renderer.ts";
import { appliedPool } from "../core/wounds.ts";

addCmd({
  name: "+roll",
  pattern: /^\+roll(?:\/(spec(?:ialty)?))?\s+(.*)/i,
  lock: "connected",
  category: "Dice",
  help: `+roll[/spec] <pool> [vs <difficulty>]  -- Roll a WoD20th dice pool.

  pool        : a number, or a trait expression (e.g. Strength+Brawl+2)
  difficulty  : target number, default ${DEFAULT_DIFFICULTY} (range 2-10)

SYNTAX
  +roll[/spec] <pool> [vs <difficulty>]

SWITCHES
  /spec    Specialty -- 10s count as 2 successes.

EXAMPLES
  +roll 8               Roll 8 dice at difficulty 6.
  +roll Strength+Brawl  Roll your Strength+Brawl pool at difficulty 6.
  +roll 6 vs 7          Roll 6 dice at difficulty 7.
  +roll/spec Dexterity+Melee vs 5
                        Roll with specialty at difficulty 5.`,

  exec: async (u: IUrsamuSDK) => {
    const specialty = !!(u.cmd.args[0]);
    const raw       = u.util.stripSubs(u.cmd.args[1] ?? "").trim();

    if (!raw) { u.send("Usage: +roll[/spec] <pool> [vs <difficulty>]"); return; }

    // Parse optional difficulty suffix:  "expr vs N"  or  "expr/N"
    let exprStr: string;
    let difficulty = DEFAULT_DIFFICULTY;

    const vsMatch    = raw.match(/^(.+?)\s+vs\s+(\d+)$/i);
    const slashMatch = raw.match(/^(.+?)\/(\d+)$/);

    if (vsMatch)    { exprStr = vsMatch[1];    difficulty = parseInt(vsMatch[2],    10); }
    else if (slashMatch) { exprStr = slashMatch[1]; difficulty = parseInt(slashMatch[2], 10); }
    else            { exprStr = raw; }

    if (difficulty < 2 || difficulty > 10) {
      u.send("Difficulty must be between 2 and 10.");
      return;
    }

    // Resolve pool -- try plain number first, then trait expression
    let resolution: { pubLabel: string; privLabel: string; pool: number };
    let woundPen = 0;  // only applied when the pool resolves from a real char

    const asNum = Number(exprStr.trim());
    if (!isNaN(asNum) && exprStr.trim() !== "") {
      if (asNum <= 0) { u.send("%cyPool is 0 -- nothing to roll.%cn"); return; }
      const p = Math.min(Math.floor(asNum), MAX_POOL);
      resolution = { pool: p, pubLabel: String(p), privLabel: String(p) };
    } else {
      const char = await findByPlayer(u.me.id);
      if (!char) { u.send("No character on file -- use a number for your pool."); return; }

      const resolved = resolvePoolExpr(char, exprStr);
      if (!resolved) { u.send(`%crUnknown trait: "${exprStr}"%cn`); return; }
      if (resolved.pool < 1) { u.send("%cyPool resolved to 0 -- nothing to roll.%cn"); return; }

      // M20 wound penalties: incapacitated characters cannot act; otherwise
      // deduct the worst-level penalty from the resolved pool.
      const applied = appliedPool(char, Math.min(resolved.pool, MAX_POOL));
      if (applied.incap) {
        u.send("%crYou are incapacitated and cannot act.%cn");
        return;
      }
      woundPen = applied.penalty;
      if (applied.pool < 1) {
        u.send(`%cyWound penalty (-${woundPen}) reduces your pool to 0 -- nothing to roll.%cn`);
        return;
      }
      resolution = { pool: applied.pool, pubLabel: resolved.pubLabel, privLabel: resolved.privLabel };
    }

    const roll  = rollDice(resolution.pool, difficulty, specialty);
    const name  = u.util.displayName(u.me, u.me);
    // Annotate the labels with the wound deduction so the player sees it.
    const annotated = woundPen > 0
      ? {
          pubLabel:  `${resolution.pubLabel} (wound -${woundPen})`,
          privLabel: `${resolution.privLabel} (wound -${woundPen})`,
        }
      : { pubLabel: resolution.pubLabel, privLabel: resolution.privLabel };
    const { pub, priv } = formatRoll(roll, annotated, name);

    // Roller and staff in room see the detailed private view.
    // Everyone in the room sees the public summary.
    u.send(priv);

    const room = u.me.location
      ? await u.util.target(u.me, u.me.location, false)
      : null;
    const contents = Array.isArray(room?.contents) ? room.contents : [];
    for (const obj of contents) {
      if (!obj || obj.id === u.me.id) continue;
      if (!obj.flags.has("connected")) continue;
      const isStaff = obj.flags.has("admin") || obj.flags.has("wizard") || obj.flags.has("superuser");
      u.send(isStaff ? priv : pub, obj.id);
    }
  },
});

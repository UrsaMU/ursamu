// commands/hurt.ts -- +hurt and +heal commands for the WoD20th health track.
// Syntax:  +hurt <target>=<amount><type>   e.g.  +hurt me=3b  /  +hurt alice=1lethal
// Players may use "me" as target; staff (admin+) may name others.
import { addCmd } from "@ursamu/ursamu";
import type { IUrsamuSDK } from "@ursamu/ursamu";
import { findByPlayer, saveChar } from "../db/charDb.ts";
import { applyDamage, healDamage, parseDamageType } from "../core/health.ts";
import { formatHurt, formatHeal } from "../core/renderer.ts";
import { SplatRegistry } from "../core/registry.ts";
import { emitHealthChanged } from "../hooks.ts";
import type { DamageMark } from "../core/types.ts";

// -- Shared helpers ---------------------------------------------------------

function isStaff(u: IUrsamuSDK): boolean {
  return u.me.flags.has("admin") || u.me.flags.has("wizard") || u.me.flags.has("superuser");
}

/**
 * Parse the right-hand side of the `=`.
 * Accepts compact forms ("3b", "1l", "2agg") and spaced forms ("3 bashing").
 * Returns [amount, typeStr] or null on parse failure.
 */
function parseRhs(raw: string): [number, string] | null {
  const compact = raw.trim().match(/^(\d+)\s*([a-z]+)$/i);
  if (!compact) return null;
  const amount = parseInt(compact[1], 10);
  if (isNaN(amount) || amount < 1) return null;
  return [amount, compact[2]];
}

/** Resolve target: "me" (or "self") always returns actor's own id; others require staff. */
async function resolveTarget(
  u: IUrsamuSDK,
  targetStr: string,
): Promise<string | null> {
  if (targetStr.toLowerCase() === "me" || targetStr.toLowerCase() === "self") {
    return u.me.id;
  }
  if (!isStaff(u)) {
    u.send("%crPermission denied.%cn  Only staff may target others.");
    return null;
  }
  const obj = await u.util.target(u.me, targetStr, true);
  if (!obj) { u.send("Target not found."); return null; }
  return obj.id;
}

// -- +hurt ------------------------------------------------------------------

addCmd({
  name: "+hurt",
  pattern: /^\+hurt\s+(.+)=(.+)/i,
  lock: "connected",
  category: "Combat",
  help: `+hurt <target>=<amount><type>  -- Apply damage to a character.

  target  : "me" for yourself; any name for others (staff only)
  amount  : number of damage boxes
  type    : b / bashing  |  l / lethal  |  a / agg / aggravated

SYNTAX
  +hurt <target>=<amount><type>

EXAMPLES
  +hurt me=3b             Take 3 bashing damage.
  +hurt me=1lethal        Take 1 lethal damage.
  +hurt alice=2agg        Apply 2 aggravated damage to Alice (staff only).`,

  exec: async (u: IUrsamuSDK) => {
    const targetStr = u.util.stripSubs(u.cmd.args[0]).trim();
    const rhsRaw    = u.util.stripSubs(u.cmd.args[1]).trim();

    const targetId = await resolveTarget(u, targetStr);
    if (targetId === null) return;

    const parsed = parseRhs(rhsRaw);
    if (!parsed) { u.send("Usage: +hurt <target>=<amount><type>  e.g.  +hurt me=3b"); return; }
    const [amount, typeStr] = parsed;

    const dtype = parseDamageType(typeStr);
    if (!dtype) { u.send("Type must be: bashing (b), lethal (l), or aggravated (agg/a)."); return; }

    const char = await findByPlayer(targetId);
    if (!char) { u.send("No character on file."); return; }

    const overflow = applyDamage(char, dtype, amount);
    await saveChar(char);

    if (!char.healthTrack) { u.send("No health track found. Contact staff."); return; }
    const track      = char.healthTrack;
    const actorName  = u.util.displayName(u.me, u.me);
    const tgt        = targetId === u.me.id ? u.me : await u.util.target(u.me, targetId, false);
    const targetName = tgt ? u.util.displayName(tgt, u.me) : targetStr;

    const splatDef      = SplatRegistry.get(char.splat);
    const overflowLabel = splatDef?.overflowLabel ?? "Incapacitated";
    const incapLabel    = splatDef?.incapLabel    ?? "Incapacitated";
    const msg = formatHurt(actorName, targetName, amount, dtype, track, overflow, overflowLabel, incapLabel);
    u.send(msg);
    if (targetId !== u.me.id) u.send(msg, targetId);

    emitHealthChanged({
      actorId: u.me.id, targetId, charId: char.id,
      action: "hurt", damageType: dtype, amount, track,
    });
  },
});

// -- +heal ------------------------------------------------------------------

addCmd({
  name: "+heal",
  pattern: /^\+heal\s+(.+)=(.+)/i,
  lock: "connected",
  category: "Combat",
  help: `+heal <target>=<amount><type>  -- Heal damage on a character.

  target  : "me" for yourself; any name for others (staff only)
  amount  : number of boxes to heal
  type    : b / bashing  |  l / lethal  |  a / agg / aggravated  |  all

SYNTAX
  +heal <target>=<amount><type>

EXAMPLES
  +heal me=2b             Heal 2 bashing damage on yourself.
  +heal me=1l             Heal 1 lethal damage on yourself.
  +heal alice=1agg        Heal 1 aggravated on Alice (staff only).`,

  exec: async (u: IUrsamuSDK) => {
    const targetStr = u.util.stripSubs(u.cmd.args[0]).trim();
    const rhsRaw    = u.util.stripSubs(u.cmd.args[1]).trim();

    const targetId = await resolveTarget(u, targetStr);
    if (targetId === null) return;

    const parsed = parseRhs(rhsRaw);
    if (!parsed) { u.send("Usage: +heal <target>=<amount><type>  e.g.  +heal me=2b"); return; }
    const [amount, typeStr] = parsed;

    let dtype: DamageMark | "all";
    if (["all", "any"].includes(typeStr.toLowerCase())) {
      dtype = "all";
    } else {
      const p = parseDamageType(typeStr);
      if (!p) { u.send("Type must be: bashing (b), lethal (l), aggravated (agg/a), or all."); return; }
      dtype = p;
    }

    const char = await findByPlayer(targetId);
    if (!char) { u.send("No character on file."); return; }

    const healed = healDamage(char, dtype, amount);
    if (healed === 0) { u.send(`No ${dtype === "all" ? "" : typeStr + " "}damage to heal.`); return; }

    await saveChar(char);

    if (!char.healthTrack) { u.send("No health track found. Contact staff."); return; }
    const track      = char.healthTrack;
    const actorName  = u.util.displayName(u.me, u.me);
    const tgt        = targetId === u.me.id ? u.me : await u.util.target(u.me, targetId, false);
    const targetName = tgt ? u.util.displayName(tgt, u.me) : targetStr;

    const msg = formatHeal(actorName, targetName, healed, dtype, track);
    u.send(msg);
    if (targetId !== u.me.id) u.send(msg, targetId);

    emitHealthChanged({
      actorId: u.me.id, targetId, charId: char.id,
      action: "heal", damageType: dtype, amount: healed, track,
    });
  },
});

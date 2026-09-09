// commands/regen.ts -- +regen command for WoD20th damage regeneration.
//
// Garou regenerate 1 Bashing per turn (and Lethal at the same rate unless
// the wound was inflicted by silver / fire / supernatural teeth+claws -- a
// state tracked by the `noRegenLethal` flag). Kinfolk and mortals heal at
// human rates; staff use /tick or /full to advance them.
import { addCmd } from "@ursamu/ursamu";
import type { IUrsamuSDK } from "@ursamu/ursamu";
import { findByPlayer, saveChar } from "../db/charDb.ts";
import { regenChar, defaultRegenPerTick } from "../core/regen.ts";
import { HEALTH_LEVELS } from "../core/health.ts";
import { coloredTrack } from "../core/renderer.ts";
import { emitHealthChanged } from "../hooks.ts";
import { poseRoom } from "../core/poseRoom.ts";
import type { DamageMark, IWoDChar } from "../core/types.ts";

function isStaff(u: IUrsamuSDK): boolean {
  return u.me.flags.has("admin") || u.me.flags.has("wizard") || u.me.flags.has("superuser");
}

/** Highest-indexed filled slot's level name, or "Healthy" when clean. */
function woundLevelName(track: DamageMark[]): string {
  for (let i = track.length - 1; i >= 0; i--) {
    if (track[i] && track[i] !== "") return HEALTH_LEVELS[i] ?? "Incapacitated";
  }
  return "Healthy";
}

function countMark(track: DamageMark[], m: DamageMark): number {
  return track.filter((x) => x === m).length;
}

/** Resolve a target string; "me"/"self" returns the actor's own char. */
async function resolveTargetChar(u: IUrsamuSDK, raw: string): Promise<{ id: string; char: IWoDChar } | null> {
  const s = raw.toLowerCase();
  if (s === "" || s === "me" || s === "self") {
    const char = await findByPlayer(u.me.id);
    if (!char) { u.send("No character on file."); return null; }
    return { id: u.me.id, char };
  }
  if (!isStaff(u)) { u.send("%crPermission denied.%cn  Only staff may target others."); return null; }
  const tgt = await u.util.target(u.me, raw, true);
  if (!tgt) { u.send("Target not found."); return null; }
  const char = await findByPlayer(tgt.id);
  if (!char) { u.send("No character on file."); return null; }
  return { id: tgt.id, char };
}

addCmd({
  name: "+regen",
  pattern: /^\+regen(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Combat",
  help: `+regen[/switch] [<count>|<target>]  -- Garou damage regeneration.

SYNTAX
  +regen [<count>]            Heal N (default 1) Bashing on self.
  +regen/lethal [<count>]     Heal N (default 1) Lethal on self.
  +regen/full <target>        Staff: fully heal B+L on target.
  +regen/tick <target>        Staff: apply per-splat default regen.

NOTES
  WtA only for self-regen. Aggravated never auto-heals. Silver / fire
  Lethal cannot be regenerated until staff clears the flag.

EXAMPLES
  +regen                      Shake off 1 Bashing.
  +regen 3                    Shake off 3 Bashing.
  +regen/lethal               Knit one Lethal wound shut.
  +regen/full Bran            Staff: fully heal Bran.`,

  exec: async (u: IUrsamuSDK) => {
    const sw  = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const arg = u.util.stripSubs(u.cmd.args[1] ?? "").trim();

    // -- staff switches ----------------------------------------------------
    if (sw === "full" || sw === "tick") {
      if (!isStaff(u)) { u.send("%crPermission denied.%cn  Staff only."); return; }
      if (!arg) { u.send(`Usage: +regen/${sw} <target>`); return; }
      const resolved = await resolveTargetChar(u, arg);
      if (!resolved) return;
      const { id: targetId, char } = resolved;
      const track0 = char.healthTrack ?? [];
      const bCount = countMark(track0, "B");
      const lCount = countMark(track0, "L");

      let updated = char;
      let healedB = 0;
      let healedL = 0;
      if (sw === "full") {
        updated = regenChar(updated, "B", bCount);
        updated = regenChar(updated, "L", lCount);
        healedB = bCount;
        healedL = char.noRegenLethal ? 0 : lCount;
        if (char.noRegenLethal) {
          // Full *non-silver* heal: clear B only when the lethal block is
          // active. Restore lethal slots so they aren't lost.
          updated = { ...updated, healthTrack: track0.map((m) => (m === "B" ? "" : m)) as DamageMark[] };
        }
      } else {
        const n = defaultRegenPerTick(char);
        if (n <= 0) { u.send(`${arg} does not auto-regenerate; use +regen/full for staff healing.`); return; }
        const healAmt = Math.min(n, bCount);
        if (healAmt > 0) {
          updated = regenChar(updated, "B", healAmt);
          healedB = healAmt;
        } else if (!char.noRegenLethal) {
          const lAmt = Math.min(n, lCount);
          updated = regenChar(updated, "L", lAmt);
          healedL = lAmt;
        }
      }

      const totalHealed = healedB + healedL;
      if (totalHealed === 0) { u.send("Nothing to regenerate."); return; }
      await saveChar(updated);
      const newTrack = updated.healthTrack ?? [];
      const level    = woundLevelName(newTrack);
      const parts: string[] = [];
      if (healedB > 0) parts.push(`${healedB} Bashing`);
      if (healedL > 0) parts.push(`${healedL} Lethal`);
      const msg = `%ch%cgRegen>%cn Healed ${parts.join(" + ")} (now ${level}).%r  ${coloredTrack(newTrack)}`;
      u.send(msg);
      if (targetId !== u.me.id) u.send(msg, targetId);
      emitHealthChanged({
        actorId: u.me.id, targetId, charId: updated.id,
        action: "heal", damageType: healedL > 0 ? "L" : "B", amount: totalHealed, track: newTrack,
      });
      return;
    }

    // -- self regen (default and /lethal) ----------------------------------
    const char = await findByPlayer(u.me.id);
    if (!char) { u.send("No character on file."); return; }

    if (char.splat !== "wta") { u.send("You don't heal that quickly."); return; }

    const wantLethal = sw === "lethal" || sw === "l";
    if (sw && !wantLethal) { u.send(`Unknown switch /${sw}.  See +help regen.`); return; }

    const count = arg ? Math.max(1, parseInt(arg, 10) || 0) : 1;
    if (!count) { u.send("Count must be a positive integer."); return; }

    const track0 = char.healthTrack ?? [];
    const available = countMark(track0, wantLethal ? "L" : "B");
    if (available === 0) {
      u.send(wantLethal ? "No Lethal wounds to regenerate." : "No Bashing damage to shake off.");
      return;
    }
    if (wantLethal && char.noRegenLethal) {
      u.send("%crSilver burns -- those wounds will not close.%cn");
      return;
    }

    const toHeal = Math.min(count, available);
    const updated = regenChar(char, wantLethal ? "L" : "B", toHeal);
    await saveChar(updated);

    const newTrack = updated.healthTrack ?? [];
    const level    = woundLevelName(newTrack);
    const typeLbl  = wantLethal ? "Lethal" : "Bashing";
    const verb     = wantLethal ? "knit shut" : "shake off";
    const selfMsg  = wantLethal
      ? `%ch%cgRegen>%cn Your wounds ${verb} -- ${toHeal} ${typeLbl} healed (now ${level}).%r  ${coloredTrack(newTrack)}`
      : `%ch%cgRegen>%cn You ${verb} ${toHeal} ${typeLbl} wound${toHeal === 1 ? "" : "s"} (now ${level}).%r  ${coloredTrack(newTrack)}`;
    u.send(selfMsg);

    // Room broadcast when healing actually occurred.
    const actorName = u.util.displayName(u.me, u.me);
    poseRoom(u, `%ch${actorName}%cn's wounds knit shut.`);

    emitHealthChanged({
      actorId: u.me.id, targetId: u.me.id, charId: updated.id,
      action: "heal", damageType: wantLethal ? "L" : "B", amount: toHeal, track: newTrack,
    });
  },
});

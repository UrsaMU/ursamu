/**
 * After combat (or on a dying PC's skipped turn): resolve death saves
 * until stable, conscious, or dead → underworld.
 */
import type { IDBObj, IUrsamuSDK } from "@ursamu/ursamu";
import { migrateSheet, type DndSheet } from "./dnd_sheet.ts";
import {
  isDead,
  isDying,
  rollDeathSave,
} from "./vitality.ts";
import { maybeProcessPlayerDeath } from "./player-death.ts";

// deno-lint-ignore no-explicit-any
type Any = any;

export type DownedResolveResult = {
  sheet: DndSheet;
  lines: string[];
  died: boolean;
  stable: boolean;
};

/**
 * Roll death saves for a dying PC until they stabilize, wake, or die.
 * Caps at 6 rolls (safety). On death, runs corpse + underworld.
 */
export async function resolveDyingPc(
  u: IUrsamuSDK,
  player: IDBObj,
  opts: {
    maxRolls?: number;
    quiet?: boolean;
    underworldId?: string;
  } = {},
): Promise<DownedResolveResult> {
  const lines: string[] = [];
  let sheet = migrateSheet((player.state as Any)?.dnd);
  if (!sheet) {
    return {
      sheet: migrateSheet({}),
      lines: ["No sheet."],
      died: false,
      stable: false,
    };
  }

  if (isDead(sheet)) {
    const death = await maybeProcessPlayerDeath(
      u,
      player,
      sheet,
      { quiet: opts.quiet, underworldId: opts.underworldId },
    );
    return {
      sheet: death.sheet,
      lines: death.lines,
      died: true,
      stable: false,
    };
  }

  if (!isDying(sheet)) {
    return {
      sheet,
      lines: [],
      died: false,
      stable: !!sheet.death?.stable,
    };
  }

  const name = (u.util.displayName(player, u.me) || player.name ||
    "Someone").split(";")[0];
  const maxRolls = opts.maxRolls ?? 6;
  let rolls = 0;

  while (isDying(sheet) && rolls < maxRolls) {
    rolls++;
    const r = rollDeathSave(sheet);
    sheet = r.sheet;
    for (const ln of r.lines) {
      lines.push(`%ch${name}%cn: ${ln}`);
    }
    await u.db.modify(player.id, "$set", { "data.dnd": sheet });
    if (player.state) (player.state as Any).dnd = sheet;

    if (isDead(sheet)) {
      const death = await maybeProcessPlayerDeath(
        u,
        player,
        sheet,
        {
          quiet: opts.quiet,
          underworldId: opts.underworldId,
        },
      );
      sheet = death.sheet;
      lines.push(...death.lines);
      return {
        sheet,
        lines,
        died: true,
        stable: false,
      };
    }
    if (sheet.hp.current > 0 || sheet.death?.stable) {
      break;
    }
  }

  return {
    sheet,
    lines,
    died: false,
    stable: !!sheet.death?.stable,
  };
}

/**
 * For every PC in the encounter who is at 0 HP / dying, run
 * death saves. Broadcast lines to the room.
 */
export async function resolveEncounterDownedPcs(
  u: IUrsamuSDK,
  // deno-lint-ignore no-explicit-any
  participants: Array<{ actorId: string; kind?: string }>,
): Promise<string[]> {
  const out: string[] = [];
  for (const p of participants) {
    if (p.kind && p.kind !== "pc") continue;
    // deno-lint-ignore no-explicit-any
    const found = await u.db.search({ id: p.actorId } as any);
    const player = found[0];
    if (!player?.flags?.has?.("player")) continue;
    const sheet = migrateSheet((player.state as Any)?.dnd);
    if (!isDying(sheet) && !isDead(sheet)) continue;

    const r = await resolveDyingPc(u, player, { quiet: true });
    out.push(...r.lines);
    if (r.died) {
      out.push(
        `%ch%cr${(player.name || "A hero").split(";")[0]}%cn ` +
          `has fallen. A corpse remains; their spirit flees ` +
          `to the Grey Veil.`,
      );
    } else if (r.stable) {
      out.push(
        `%ch${(player.name || "Hero").split(";")[0]}%cn ` +
          `stabilizes at %ch0 HP%cn (unconscious).`,
      );
    }
  }
  return out;
}

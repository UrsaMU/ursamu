/**
 * Shared monster execute — +kill and auto-death on 0 HP.
 */
import type { IDBObj, IUrsamuSDK } from "@ursamu/ursamu";
import { migrateSheet, type DndSheet } from
  "../stats/dnd_sheet.ts";
import {
  endRoomFight,
  monstersRemain,
  removeFromFight,
  roomEncounter,
} from "./session.ts";
import { clearFocus } from "./focus.ts";
import { spawnCorpse } from "./spawn-corpse.ts";

// deno-lint-ignore no-explicit-any
type Any = any;

export type KillResult = {
  ok: boolean;
  message?: string;
  xp?: number;
};

function isMonsterSheet(s: DndSheet): boolean {
  return s.class === "Monster";
}

/**
 * Execute a 0 HP monster: XP, corpse, destroy, end fight if last.
 * Caller must ensure target is Monster at ≤0 HP.
 */
export async function executeMonsterKill(
  u: IUrsamuSDK,
  roomId: string,
  targetObj: IDBObj,
  opts: { quiet?: boolean; auto?: boolean } = {},
): Promise<KillResult> {
  const raw = (targetObj.state as Any)?.dnd;
  if (!raw) {
    return { ok: false, message: "No character sheet." };
  }
  const targetSheet = migrateSheet(raw);
  if (!isMonsterSheet(targetSheet)) {
    return { ok: false, message: "Not a monster." };
  }
  if ((targetSheet.hp?.current ?? 0) > 0) {
    return {
      ok: false,
      message: `${u.util.displayName(targetObj, u.me)} is still ` +
        `standing!`,
    };
  }

  const npcXp = targetSheet.xp || 50;
  const playerSheet = migrateSheet((u.me.state as Any).dnd);
  playerSheet.xp = (playerSheet.xp || 0) + npcXp;
  await u.db.modify(u.me.id, "$set", { "data.dnd": playerSheet });
  if (u.me.state) (u.me.state as Any).dnd = playerSheet;

  const nameT = u.util.displayName(targetObj, u.me);
  const nameA = u.util.displayName(u.me, u.me);
  if (!opts.quiet) {
    const flavors = [
      "delivers a decapitating blow, executing",
      "drives their blade through the heart of, executing",
      "crushes the skull of, executing",
      "delivers a fatal strike, executing",
      "lands a perfect death blow on, executing",
    ];
    const flavor = opts.auto
      ? "finishes"
      : flavors[Math.floor(Math.random() * flavors.length)];
    u.broadcast(
      `%ch${nameA}%cn ${flavor} %ch${nameT}%cn!`,
    );
    u.send(`You gain %ch${npcXp}%cn XP.`);
  }

  try {
    const { formatLevelReady } = await import(
      "../stats/levelup.ts"
    );
    const tip = formatLevelReady(playerSheet);
    if (tip) u.send(`%ch%cg${tip}%cn`);
  } catch (_e: unknown) { /* optional */ }

  try {
    const { onMonsterKilled } = await import(
      "../world/bounty-progress.ts"
    );
    const tmpl = String(
      (targetSheet as Any).npcTemplate ||
        targetObj.name?.split(";")[0] ||
        "",
    ).toLowerCase().replace(/\s+/g, "_");
    const tip = await onMonsterKilled(
      u,
      guessTemplate(tmpl, targetObj.name || ""),
    );
    if (tip) u.send(tip);
  } catch (_e: unknown) { /* optional */ }

  await spawnCorpse(u, roomId, targetObj, targetSheet);
  const focus = (u.me.state as Any)?.dndCombat;
  if (focus?.focusId && String(focus.focusId) === targetObj.id) {
    await clearFocus(u);
  }
  await u.db.destroy(targetObj.id);

  let enc = await roomEncounter(roomId);
  if (enc && enc.status === "active") {
    enc = (await removeFromFight(enc, targetObj.id)) ?? enc;
    const left = await monstersRemain(u, enc);
    if (!left) {
      u.broadcast(
        "All enemies have been defeated! Combat has ended.",
      );
      await endRoomFight(u, enc, { quiet: true });
    }
  }
  return { ok: true, xp: npcXp };
}

function guessTemplate(raw: string, name: string): string {
  const known = [
    "goblin", "wolf", "bandit", "orc", "ogre", "skeleton",
    "zombie", "spider", "troll", "wight", "giant_wolf_spider",
  ];
  const n = `${raw} ${name}`.toLowerCase();
  for (const k of known) {
    if (n.includes(k.replace(/_/g, " ")) || n.includes(k)) {
      return k;
    }
  }
  return raw || "unknown";
}


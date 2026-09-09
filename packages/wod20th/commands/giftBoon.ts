// commands/giftBoon.ts -- helper for +gift/use totem-boon path.
//
// Extracted into its own module so the audit guards in tests/gift_audit.ts
// (which scan commands/gift.ts source for ordering of spendPool / poseRoom /
// if (!result.ok)) remain stable. This module hosts the boon-specific
// spend + pose; commands/gift.ts only calls into it.
import type { IUrsamuSDK } from "@ursamu/ursamu";
import { gameHooks } from "@ursamu/ursamu";
import "../hooks.ts";
import { saveChar } from "../db/charDb.ts";
import type { IPack } from "../db/packDb.ts";
import type { IWoDChar } from "../core/types.ts";
import { frenzyBlockMessage } from "../core/frenzyGate.ts";
import { poseRoom } from "../core/poseRoom.ts";
import { shiftedDisplayName } from "../core/displayName.ts";
import { applyTotemBoonSpend, boonSlug, findBoonInList } from "../core/totemBoon.ts";

/** Re-export for the parent command. */
export { boonSlug };
export function findBoon(pack: IPack | null, slug: string): string | null {
  if (!pack) return null;
  return findBoonInList(pack.totemBoons, slug);
}

/**
 * Run the totem-boon use path. Returns true when handled (boon matched and
 * the spend either succeeded or failed with a user-facing message). Returns
 * false when the slug did not match any boon, so the caller can fall back
 * to its regular gift activation flow.
 */
export async function tryUseTotemBoon(
  u: IUrsamuSDK,
  char: IWoDChar,
  pack: IPack | null,
  arg: string,
): Promise<boolean> {
  const boon = findBoon(pack, arg);
  if (!boon) return false;

  const block = frenzyBlockMessage(char, "invoke a totem boon");
  if (block) { u.send(block); return true; }

  // Single fail-closed spend (applyTotemBoonSpend handles the check + mutation).
  const applied = applyTotemBoonSpend(char);
  if (!applied.ok) { u.send(applied.message); return true; }

  await saveChar(char);

  gameHooks.emit("wod20th:gift-used", {
    playerId: u.me.id,
    charId: char.id,
    slug: boonSlug(boon),
    cost: 1,
    costBreakdown: { gnosis: 1 },
  });

  const loginName = u.util.displayName(u.me, u.me);
  const seenAs = shiftedDisplayName(char, loginName);
  u.send(`%cgYou invoke totem boon %ch${boon}%cn%cg (-1 Gnosis).%cn`);
  poseRoom(
    u,
    `%cy${seenAs}%cn calls on %ch${pack?.totem || "the pack totem"}%cn ` +
    `for the boon: %ch${boon}%cn.`,
  );
  return true;
}

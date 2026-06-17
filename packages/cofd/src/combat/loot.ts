// Loot table loader + drop helper. Loot is awarded when an NPC archetype
// is defeated during scene resolution. Tables map archetype-key ->
// list of { key, count } where key is an equipment catalog entry.

import type { IUrsamuSDK } from "@ursamu/ursamu";
import { createItem, itemData } from "../equipment/objects.ts";

const lootUrl = new URL("../../resources/loot.json", import.meta.url);
let LOOT_TABLES: Record<string, Array<{ key: string; count: number }>>;
try {
  LOOT_TABLES = JSON.parse(Deno.readTextFileSync(lootUrl));
} catch {
  LOOT_TABLES = {};
}

/** Return the loot table for an archetype key, or [] if unknown. */
export function lootFor(
  archetype: string,
): Array<{ key: string; count: number }> {
  if (!archetype) return [];
  return LOOT_TABLES[archetype.toLowerCase().trim()] ?? [];
}

/**
 * Drop archetype loot in the given room. Each entry is created as a new
 * Thing in the room; ammo entries with count > 1 get their stack count
 * patched via $set after creation. Errors per item are swallowed so a bad
 * catalog key never aborts scene resolution.
 */
export async function dropLoot(
  u: IUrsamuSDK,
  archetype: string,
  roomId: string,
): Promise<string[]> {
  const table = lootFor(archetype);
  const dropped: string[] = [];
  for (const entry of table) {
    try {
      const obj = await createItem(u, roomId, entry.key);
      if (!obj) continue;
      // For ammo with count > 1, patch the stack size after creation.
      if (entry.count > 1) {
        const d = itemData(obj);
        if (d?.kind === "ammo") {
          await u.db.modify(obj.id, "$set", {
            "data.cofd_item": { ...d, count: entry.count },
          });
        }
      }
      dropped.push(entry.key);
    } catch {
      /* best-effort */
    }
  }
  return dropped;
}

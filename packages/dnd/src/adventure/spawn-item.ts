/**
 * Spawn a loot item (weapon/armor/potion/gp pile) into a location.
 */
import type { IUrsamuSDK } from "@ursamu/ursamu";

export async function spawnLootItem(
  u: IUrsamuSDK,
  locationId: string,
  name: string,
  typeSpec: string,
  ownerId: string,
  extra: Record<string, unknown> = {},
): Promise<void> {
  // deno-lint-ignore no-explicit-any
  const dndData: Record<string, any> = {
    type: "general",
    equipped: false,
  };
  // Merge extras after base type parse so magic flags stick
  const extraIn = { ...extra };
  const parts = typeSpec.split(":");
  const itemType = parts[0];
  if (itemType === "weapon") {
    dndData.type = "weapon";
    dndData.damage = parts[1] || "1d6";
    dndData.damageType = parts[2] || "slashing";
    dndData.properties = parts.slice(3).map((p) =>
      p.toLowerCase()
    );
    dndData.weaponType = dndData.properties.includes("ranged")
      ? "ranged"
      : "melee";
  } else if (itemType === "armor") {
    dndData.type = "armor";
    dndData.ac = parseInt(parts[1] || "11", 10);
    dndData.armorType = (parts[2] || "light").toLowerCase();
  } else if (itemType === "shield") {
    dndData.type = "shield";
    dndData.ac = parseInt(parts[1] || "2", 10);
    dndData.armorType = "shield";
  } else if (itemType === "potion") {
    dndData.type = "potion";
    dndData.heal = parts[1] || "2d4+2";
  } else if (itemType === "wondrous") {
    dndData.type = "wondrous";
  } else {
    dndData.type = itemType || "general";
  }
  Object.assign(dndData, extraIn);

  await u.db.create({
    flags: new Set(["thing"]),
    location: locationId,
    name,
    state: {
      name,
      dnd: dndData,
      owner: ownerId,
    },
  });
}

export async function spawnGoldPile(
  u: IUrsamuSDK,
  locationId: string,
  gp: number,
  ownerId: string,
): Promise<void> {
  if (gp <= 0) return;
  await u.db.create({
    flags: new Set(["thing"]),
    location: locationId,
    name: `${gp} Gold Coins;gold;coins;gp`,
    state: {
      name: `${gp} Gold Coins`,
      dnd: { type: "general", value: gp },
      owner: ownerId,
    },
  });
}

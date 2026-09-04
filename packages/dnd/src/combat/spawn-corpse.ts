/**
 * Corpse + drop table spawn after a monster kill.
 */
import type { IUrsamuSDK } from "@ursamu/mush";
import type { DndSheet } from "../stats/dnd_sheet.ts";
import type { DropConfig } from "./npc-templates.ts";

// deno-lint-ignore no-explicit-any
type Any = any;

export async function spawnCorpse(
  u: IUrsamuSDK,
  roomId: string,
  targetObj: { id: string; name?: string },
  targetSheet: DndSheet,
): Promise<void> {
  const prefixes = [
    "lifeless body of",
    "mangled corpse of",
    "bloodied remains of",
    "battered corpse of",
  ];
  const prefix = prefixes[
    Math.floor(Math.random() * prefixes.length)
  ];
  const tName = targetObj.name?.split(";")[0] || "Monster";
  const corpseName = `${prefix} ${tName}`;
  const cap = corpseName.charAt(0).toUpperCase() +
    corpseName.slice(1);
  const dbName =
    `${cap};corpse;corpse of ${tName};remains of ${tName};` +
    `body of ${tName};${tName} corpse`;
  const descs = [
    `The blood-spattered remains of ${tName}. Flies circle.`,
    `The lifeless form of ${tName}, cold to the touch.`,
    `The battered body of ${tName} in a pool of blood.`,
    `The quiet remains of ${tName}, staring blankly.`,
  ];
  const corpseDesc = descs[
    Math.floor(Math.random() * descs.length)
  ];
  const corpse = await u.db.create({
    flags: new Set(["thing"]),
    location: roomId,
    name: dbName,
    state: {
      name: cap,
      desc: corpseDesc +
        " Something might be worth a careful %chloot%cn.",
      dnd: {
        type: "corpse",
        noGet: true,
      },
      locks: { basic: "flag(wizard)" },
      FAIL: "Leave the body. Try looting it.",
    },
  });

  const drops: DropConfig[] =
    ((targetSheet as Any).drops as DropConfig[]) || [];
  for (const drop of drops) {
    if (Math.random() > drop.chance) continue;
    await spawnDrop(u, corpse.id, drop, u.me.id);
  }

  // Only real loot — never natural attacks (Bite/Claw) if any
  // legacy item still exists on the mob.
  // deno-lint-ignore no-explicit-any
  const carried = await u.db.search({
    location: targetObj.id,
  } as any);
  for (const item of carried) {
    if (!item.flags?.has?.("thing")) continue;
    // deno-lint-ignore no-explicit-any
    const d = (item.state as any)?.dnd ?? {};
    const n = String(item.name || "").toLowerCase();
    const natural = d.natural === true ||
      d.naturalAttack === true ||
      /^(bite|claw|beak|slam|horn|tail|stinger)\b/.test(n);
    if (natural) {
      try {
        await u.db.destroy(item.id);
      } catch {
        /* ok */
      }
      continue;
    }
    await u.db.modify(item.id, "$set", {
      location: corpse.id,
      "data.dnd.equipped": false,
    });
  }
  u.broadcast(`${cap} is left on the ground.`);
}

async function spawnDrop(
  u: IUrsamuSDK,
  corpseId: string,
  drop: DropConfig,
  ownerId: string,
): Promise<void> {
  // deno-lint-ignore no-explicit-any
  const dndData: Record<string, any> = {
    type: drop.type,
    equipped: false,
  };
  const parts = drop.type.split(":");
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
  } else {
    dndData.type = "general";
  }

  let finalName = drop.item;
  if (drop.item === "Gold Coins" && drop.formula) {
    const m = drop.formula.match(/^(\d+)[dD](\d+)$/);
    if (m) {
      const count = parseInt(m[1], 10);
      const sides = parseInt(m[2], 10);
      let goldRoll = 0;
      for (let i = 0; i < count; i++) {
        goldRoll += Math.floor(Math.random() * sides) + 1;
      }
      finalName = `${goldRoll} Gold Coins`;
      dndData.value = goldRoll;
    }
  }

  await u.db.create({
    flags: new Set(["thing"]),
    location: corpseId,
    name: finalName,
    state: {
      name: finalName,
      dnd: dndData,
      owner: ownerId,
    },
  });
}

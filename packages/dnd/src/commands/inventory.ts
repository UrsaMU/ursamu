/**
 * D&D inventory commands: list, wield, wear, remove, item/create.
 */
import { addCmd, type IUrsamuSDK } from "@ursamu/mush";
import { getAbilityMod, migrateSheet } from
  "../stats/dnd_sheet.ts";
import {
  carried,
  dndOf,
  initInventoryHook,
  prefersWebInv,
  removeInventoryHook,
  showDndInventory,
} from "./inventory-show.ts";

export {
  initInventoryHook,
  removeInventoryHook,
  showDndInventory,
};

// deno-lint-ignore no-explicit-any
type Any = any;

export async function recalculateAndSaveAC(
  u: IUrsamuSDK,
  target: Any,
): Promise<void> {
  const sheet = migrateSheet(target.state?.dnd);
  const dexMod = getAbilityMod(sheet.abilities.dexterity);
  const items = await u.db.search({ location: target.id });
  const equippedArmor = items.find((item) =>
    item.flags.has("thing") &&
    dndOf(item).type === "armor" &&
    dndOf(item).equipped
  );
  const equippedShield = items.find((item) =>
    item.flags.has("thing") &&
    dndOf(item).type === "shield" &&
    dndOf(item).equipped
  );
  let baseAc = 10;
  if (equippedArmor) {
    const armorAc = Number(dndOf(equippedArmor).ac) || 10;
    const armorType = String(
      dndOf(equippedArmor).armorType || "light",
    );
    if (armorType === "light") baseAc = armorAc + dexMod;
    else if (armorType === "medium") {
      baseAc = armorAc + Math.min(2, dexMod);
    } else if (armorType === "heavy") baseAc = armorAc;
  } else {
    baseAc = 10 + dexMod;
  }
  if (equippedShield) {
    baseAc += Number(dndOf(equippedShield).ac) || 2;
  }
  sheet.ac = baseAc;
  await u.db.modify(target.id, "$set", { "data.dnd": sheet });
  if (target.state) target.state.dnd = sheet;
}

addCmd({
  name: "+inventory",
  pattern: /^\+inventory$/i,
  lock: "connected",
  category: "Dnd",
  help:
    `+inventory  — List gear; tap to wield/wear on web.\n` +
    `Also: inventory, inv, i\n\n` +
    `  +wield <weapon|#id>   +unwield <…>\n` +
    `  +wear <armor|#id>     +remove <…>`,
  exec: async (u: IUrsamuSDK) => {
    await showDndInventory(u);
  },
});

addCmd({
  name: "+wield",
  pattern: /^\+wield\s+(.*)/i,
  lock: "connected",
  category: "Dnd",
  help: `+wield <weapon|#id>  — Wield a carried weapon.`,
  exec: async (u: IUrsamuSDK) => {
    const arg = u.util.stripSubs(u.cmd.args[0] || "").trim();
    if (!arg) {
      u.send("Wield what?");
      return;
    }
    const thing = await u.util.target(u.me, arg);
    if (!thing || thing.location !== u.me.id) {
      u.send("You aren't carrying that.");
      return;
    }
    if (dndOf(thing).type !== "weapon") {
      u.send("That is not a weapon.");
      return;
    }
    const items = await carried(u);
    const other = items.filter((i) =>
      i.id !== thing.id &&
      dndOf(i).type === "weapon" &&
      dndOf(i).equipped
    );
    const props = (dndOf(thing).properties as string[]) || [];
    const isLight = props.includes("light");
    for (const ow of other) {
      const op = (dndOf(ow).properties as string[]) || [];
      if (!isLight || !op.includes("light")) {
        await u.db.modify(ow.id, "$set", {
          "data.dnd.equipped": false,
        });
      }
    }
    await u.db.modify(thing.id, "$set", {
      "data.dnd.equipped": true,
    });
    u.send(`You wield ${u.util.displayName(thing, u.me)}.`);
    if (prefersWebInv(u)) await showDndInventory(u);
  },
});

addCmd({
  name: "+unwield",
  pattern: /^\+unwield\s+(.*)/i,
  lock: "connected",
  category: "Dnd",
  help: `+unwield <weapon|#id>  — Stop wielding.`,
  exec: async (u: IUrsamuSDK) => {
    const arg = u.util.stripSubs(u.cmd.args[0] || "").trim();
    if (!arg) {
      u.send("Unwield what?");
      return;
    }
    const thing = await u.util.target(u.me, arg);
    if (!thing || thing.location !== u.me.id) {
      u.send("You aren't wielding that.");
      return;
    }
    if (
      !dndOf(thing).equipped ||
      dndOf(thing).type !== "weapon"
    ) {
      u.send("You aren't wielding that.");
      return;
    }
    await u.db.modify(thing.id, "$set", {
      "data.dnd.equipped": false,
    });
    u.send(
      `You stop wielding ${u.util.displayName(thing, u.me)}.`,
    );
    if (prefersWebInv(u)) await showDndInventory(u);
  },
});

addCmd({
  name: "+wear",
  pattern: /^\+wear\s+(.*)/i,
  lock: "connected",
  category: "Dnd",
  help: `+wear <armor|shield|#id>  — Equip armor or shield.`,
  exec: async (u: IUrsamuSDK) => {
    const arg = u.util.stripSubs(u.cmd.args[0] || "").trim();
    if (!arg) {
      u.send("Wear what?");
      return;
    }
    const thing = await u.util.target(u.me, arg);
    if (!thing || thing.location !== u.me.id) {
      u.send("You aren't carrying that.");
      return;
    }
    const type = dndOf(thing).type;
    if (type !== "armor" && type !== "shield") {
      u.send("That is not armor or a shield.");
      return;
    }
    const items = await carried(u);
    for (const ste of items) {
      if (
        ste.id !== thing.id &&
        dndOf(ste).type === type &&
        dndOf(ste).equipped
      ) {
        await u.db.modify(ste.id, "$set", {
          "data.dnd.equipped": false,
        });
      }
    }
    await u.db.modify(thing.id, "$set", {
      "data.dnd.equipped": true,
    });
    await recalculateAndSaveAC(u, u.me);
    u.send(`You equip ${u.util.displayName(thing, u.me)}.`);
    if (prefersWebInv(u)) await showDndInventory(u);
  },
});

addCmd({
  name: "+remove",
  pattern: /^\+remove\s+(.*)/i,
  lock: "connected",
  category: "Dnd",
  help: `+remove <armor|shield|#id>  — Unequip armor/shield.`,
  exec: async (u: IUrsamuSDK) => {
    const arg = u.util.stripSubs(u.cmd.args[0] || "").trim();
    if (!arg) {
      u.send("Remove what?");
      return;
    }
    const thing = await u.util.target(u.me, arg);
    if (!thing || thing.location !== u.me.id) {
      u.send("You aren't carrying that.");
      return;
    }
    const d = dndOf(thing);
    if (
      !d.equipped ||
      (d.type !== "armor" && d.type !== "shield")
    ) {
      u.send("You aren't wearing that.");
      return;
    }
    await u.db.modify(thing.id, "$set", {
      "data.dnd.equipped": false,
    });
    await recalculateAndSaveAC(u, u.me);
    u.send(
      `You remove ${u.util.displayName(thing, u.me)}.`,
    );
    if (prefersWebInv(u)) await showDndInventory(u);
  },
});

addCmd({
  name: "+item/create",
  pattern: /^\+item\/create\s+(.+)\s*=\s*(.*)/i,
  lock: "connected builder+",
  category: "Dnd",
  help: `+item/create <name>=weapon|armor|shield|general:…`,
  exec: async (u: IUrsamuSDK) => {
    const name = u.util.stripSubs(u.cmd.args[0]).trim();
    const typeSpec = u.util.stripSubs(u.cmd.args[1]).trim();
    if (!name || !typeSpec) {
      u.send("Usage: +item/create <name>=<type>[:params]");
      return;
    }
    const parts = typeSpec.split(":");
    const type = parts[0].toLowerCase();
    // deno-lint-ignore no-explicit-any
    const dndData: Record<string, any> = {
      type,
      equipped: false,
    };
    if (type === "weapon") {
      dndData.damage = parts[1] || "1d6";
      dndData.damageType = parts[2] || "slashing";
      dndData.properties = parts.slice(3).map((p) =>
        p.toLowerCase()
      );
      dndData.weaponType =
        dndData.properties.includes("ranged")
          ? "ranged"
          : "melee";
    } else if (type === "armor") {
      dndData.ac = parseInt(parts[1] || "11", 10);
      dndData.armorType = (parts[2] || "light").toLowerCase();
    } else if (type === "shield") {
      dndData.ac = parseInt(parts[1] || "2", 10);
      dndData.armorType = "shield";
    } else if (type !== "general") {
      u.send("Types: weapon, armor, shield, general.");
      return;
    }
    const thing = await u.db.create({
      flags: new Set(["thing"]),
      location: u.me.id,
      name,
      state: { name, dnd: dndData, owner: u.me.id },
    });
    u.send(`Created ${name} (#${thing.id}).`);
  },
});


import { addCmd, type IUrsamuSDK, header, divider, footer } from "@ursamu/ursamu";
import { getAbilityMod, migrateSheet } from "../stats/dnd_sheet.ts";

export async function recalculateAndSaveAC(u: IUrsamuSDK, target: any) {
  const sheet = migrateSheet((target.state as any)?.dnd);
  const dexMod = getAbilityMod(sheet.abilities.dexterity);
  
  const items = await u.db.search({ location: target.id });
  const equippedArmor = items.find(item => item.flags.has("thing") && (item.state as any).dnd?.type === "armor" && (item.state as any).dnd?.equipped);
  const equippedShield = items.find(item => item.flags.has("thing") && (item.state as any).dnd?.type === "shield" && (item.state as any).dnd?.equipped);

  let baseAc = 10;
  if (equippedArmor) {
    const armorAc = ((equippedArmor.state as any).dnd.ac as number) || 10;
    const armorType = ((equippedArmor.state as any).dnd.armorType as string) || "light";
    if (armorType === "light") {
      baseAc = armorAc + dexMod;
    } else if (armorType === "medium") {
      baseAc = armorAc + Math.min(2, dexMod);
    } else if (armorType === "heavy") {
      baseAc = armorAc;
    }
  } else {
    baseAc = 10 + dexMod;
  }

  if (equippedShield) {
    baseAc += ((equippedShield.state as any).dnd.ac as number) || 2;
  }

  sheet.ac = baseAc;
  await u.db.modify(target.id, "$set", { "data.dnd": sheet });
}

addCmd({
  name: "+inventory",
  pattern: /^\+inv(?:entory)?$/i,
  lock: "connected",
  category: "Dnd",
  help: `+inventory  -- List your D&D inventory and equipment.
Alias: +inv

Examples:
  +inventory
  +inv`,
  exec: async (u: IUrsamuSDK) => {
    const items = await u.db.search({ location: u.me.id });
    const name = u.util.displayName(u.me, u.me);

    const weapons = items.filter(i => i.flags.has("thing") && (i.state as any).dnd?.type === "weapon");
    const armors = items.filter(i => i.flags.has("thing") && ((i.state as any).dnd?.type === "armor" || (i.state as any).dnd?.type === "shield"));
    const general = items.filter(i => i.flags.has("thing") && (i.state as any).dnd?.type !== "weapon" && (i.state as any).dnd?.type !== "armor" && (i.state as any).dnd?.type !== "shield");

    const lines: string[] = [header(`${name.toUpperCase()}'S INVENTORY`)];

    lines.push(divider("W E A P O N S"));
    if (weapons.length === 0) {
      lines.push("  (none)");
    } else {
      for (const w of weapons) {
        const eqStr = (w.state as any).dnd.equipped ? " %cg[Wielded]%cn" : "";
        const damage = (w.state as any).dnd.damage || "1d6";
        const damageType = (w.state as any).dnd.damageType || "slashing";
        const props = Array.isArray((w.state as any).dnd.properties) ? (w.state as any).dnd.properties.join(", ") : "";
        const propStr = props ? ` (${props})` : "";
        const desc = `${damage} ${damageType}${propStr}`;
        lines.push(`  ${u.util.ljust(w.name || "Weapon", 22)}${u.util.ljust(desc, 30)}${eqStr}`);
      }
    }

    lines.push(divider("A R M O R   &   S H I E L D S"));
    if (armors.length === 0) {
      lines.push("  (none)");
    } else {
      for (const a of armors) {
        const eqStr = (a.state as any).dnd.equipped ? " %cg[Equipped]%cn" : "";
        const acVal = (a.state as any).dnd.ac || 10;
        const aType = (a.state as any).dnd.armorType || "light";
        const desc = `AC: ${acVal} (${aType})`;
        lines.push(`  ${u.util.ljust(a.name || "Armor", 22)}${u.util.ljust(desc, 30)}${eqStr}`);
      }
    }

    lines.push(divider("O T H E R   I T E M S"));
    if (general.length === 0) {
      lines.push("  (none)");
    } else {
      for (const g of general) {
        lines.push(`  * ${g.name}`);
      }
    }

    lines.push(footer());
    u.send(lines.join("\n"));
  }
});

addCmd({
  name: "+wield",
  pattern: /^\+wield\s+(.*)/i,
  lock: "connected",
  category: "Dnd",
  help: `+wield <weapon>  -- Wield a weapon from your inventory.

Examples:
  +wield longsword
  +wield dagger`,
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

    if ((thing.state as any).dnd?.type !== "weapon") {
      u.send("That is not a weapon.");
      return;
    }

    // Wield logic:
    // If weapon has "light" property, player can dual wield if other equipped weapon also has "light".
    // Otherwise, unequip all other weapons.
    const items = await u.db.search({ location: u.me.id });
    const otherWeapons = items.filter(i => i.id !== thing.id && i.flags.has("thing") && (i.state as any).dnd?.type === "weapon" && (i.state as any).dnd?.equipped);
    const thingProps = ((thing.state as any).dnd?.properties as string[]) || [];
    const isLight = thingProps.includes("light");

    for (const ow of otherWeapons) {
      const owProps = ((ow.state as any).dnd?.properties as string[]) || [];
      const owLight = owProps.includes("light");
      if (!isLight || !owLight) {
        await u.db.modify(ow.id, "$set", { "data.dnd.equipped": false });
      }
    }

    await u.db.modify(thing.id, "$set", { "data.dnd.equipped": true });
    u.send(`You wield ${u.util.displayName(thing, u.me)}.`);
  }
});

addCmd({
  name: "+unwield",
  pattern: /^\+unwield\s+(.*)/i,
  lock: "connected",
  category: "Dnd",
  help: `+unwield <weapon>  -- Stop wielding a weapon.

Examples:
  +unwield longsword`,
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

    if (!(thing.state as any).dnd?.equipped || (thing.state as any).dnd?.type !== "weapon") {
      u.send("You aren't wielding that.");
      return;
    }

    await u.db.modify(thing.id, "$set", { "data.dnd.equipped": false });
    u.send(`You stop wielding ${u.util.displayName(thing, u.me)}.`);
  }
});

addCmd({
  name: "+wear",
  pattern: /^\+wear\s+(.*)/i,
  lock: "connected",
  category: "Dnd",
  help: `+wear <armor|shield>  -- Equip armor or a shield from your inventory.

Examples:
  +wear leather armor
  +wear steel shield`,
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

    const type = (thing.state as any).dnd?.type;
    if (type !== "armor" && type !== "shield") {
      u.send("That is not armor or a shield.");
      return;
    }

    const items = await u.db.search({ location: u.me.id });
    const sameTypeEquipped = items.filter(i => i.id !== thing.id && i.flags.has("thing") && (i.state as any).dnd?.type === type && (i.state as any).dnd?.equipped);

    for (const ste of sameTypeEquipped) {
      await u.db.modify(ste.id, "$set", { "data.dnd.equipped": false });
    }

    await u.db.modify(thing.id, "$set", { "data.dnd.equipped": true });
    await recalculateAndSaveAC(u, u.me);
    u.send(`You wear/equip ${u.util.displayName(thing, u.me)}.`);
  }
});

addCmd({
  name: "+remove",
  pattern: /^\+remove\s+(.*)/i,
  lock: "connected",
  category: "Dnd",
  help: `+remove <armor|shield>  -- Remove equipped armor or a shield.

Examples:
  +remove leather armor`,
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

    if (!(thing.state as any).dnd?.equipped || ((thing.state as any).dnd?.type !== "armor" && (thing.state as any).dnd?.type !== "shield")) {
      u.send("You aren't wearing that.");
      return;
    }

    await u.db.modify(thing.id, "$set", { "data.dnd.equipped": false });
    await recalculateAndSaveAC(u, u.me);
    u.send(`You remove ${u.util.displayName(thing, u.me)}.`);
  }
});

addCmd({
  name: "+item/create",
  pattern: /^\+item\/create\s+(.+)\s*=\s*(.*)/i,
  lock: "connected builder+",
  category: "Dnd",
  help: `+item/create <name>=<type>[:<param1>:<param2>...]  -- Spawn a D&D item.

Types and formats:
  weapon:<damage>:<damageType>:[properties...]
  armor:<ac>:<armorType>
  shield:<ac>
  general

Examples:
  +item/create Longsword=weapon:1d8:slashing:versatile
  +item/create Leather Armor=armor:11:light
  +item/create Steel Shield=shield:2
  +item/create Rations=general`,
  exec: async (u: IUrsamuSDK) => {
    const name = u.util.stripSubs(u.cmd.args[0]).trim();
    const typeSpec = u.util.stripSubs(u.cmd.args[1]).trim();

    if (!name || !typeSpec) {
      u.send("Usage: +item/create <name>=<type>[:<param1>:<param2>...]");
      return;
    }

    const parts = typeSpec.split(":");
    const type = parts[0].toLowerCase();

    const dndData: Record<string, any> = {
      type,
      equipped: false
    };

    if (type === "weapon") {
      dndData.damage = parts[1] || "1d6";
      dndData.damageType = parts[2] || "slashing";
      dndData.properties = parts.slice(3).map(p => p.toLowerCase());
      dndData.weaponType = dndData.properties.includes("ranged") ? "ranged" : "melee";
    } else if (type === "armor") {
      dndData.ac = parseInt(parts[1] || "11", 10);
      dndData.armorType = (parts[2] || "light").toLowerCase();
    } else if (type === "shield") {
      dndData.ac = parseInt(parts[1] || "2", 10);
      dndData.armorType = "shield";
    } else if (type !== "general") {
      u.send("Invalid type. Valid types are: weapon, armor, shield, general.");
      return;
    }

    const thing = await u.db.create({
      flags: new Set(["thing"]),
      location: u.me.id,
      name,
      state: {
        name,
        dnd: dndData,
        owner: u.me.id
      }
    });

    u.send(`Created item ${name} (#${thing.id}) in your inventory.`);
  }
});

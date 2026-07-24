import "./commands.ts";
import "@ursamu/vendor-plugin";
import type { IPlugin } from "@ursamu/ursamu";
import { registerHelpDir } from "@ursamu/help-plugin";
import { cmds, gameHooks } from "@ursamu/ursamu";
import { migrateSheet } from "./src/stats/dnd_sheet.ts";
import {
  initDndCombat,
  removeDndCombat,
} from "./src/combat/ports.ts";

export const plugin: IPlugin = {
  name: "dnd",
  version: "1.0.0",
  description: "D&D 5e/2024 (SRD 5.2) plugin for UrsaMU — character sheets, rolling with advantage/disadvantage, health/resource tracking, and guided chargen.",
  dependencies: [
    { name: "help", version: ">=1.0.0" },
    { name: "vendor", version: ">=1.0.0" },
    { name: "combat", version: ">=0.2.0" },
  ],

  init: () => {
    registerHelpDir(new URL("./help", import.meta.url).pathname, "dnd");
    initDndCombat();

    const dropCmd = cmds.find(c => c.name === "drop");
    if (dropCmd) {
      const originalExec = dropCmd.exec;
      dropCmd.exec = async (u) => {
        const arg = u.util.stripSubs(u.cmd.args[0] || "").trim();
        const thing = await u.util.target(u.me, arg);
        if (thing && (thing.state as any)?.dnd?.equipped) {
          u.send("You cannot drop equipped items. Unequip them first.");
          return;
        }
        return originalExec(u);
      };
    }

    const giveCmd = cmds.find(c => c.name === "give");
    if (giveCmd) {
      const originalExec = giveCmd.exec;
      giveCmd.exec = async (u) => {
        const itemArg = (u.cmd.args[0] ?? "").trim();
        if (!/^\d+$/.test(itemArg)) {
          const thing = await u.util.target(u.me, itemArg);
          if (thing && (thing.state as any)?.dnd?.equipped) {
            u.send("You cannot give equipped items. Unequip them first.");
            return;
          }
        }
        return originalExec(u);
      };
    }

    // Register vendor hooks for D&D integration
    gameHooks.on("vendor:format_item", (data: any) => {
      const parts = data.spec.split(":");
      const type = parts[0].toLowerCase();
      if (type === "weapon") {
        data.desc = `Weapon: ${parts[1]} ${parts[2]}`;
        if (parts.length > 3) {
          data.desc += ` (${parts.slice(3).join(", ")})`;
        }
      } else if (type === "armor") {
        data.desc = `Armor: AC ${parts[1]} (${parts[2]})`;
      } else if (type === "shield") {
        data.desc = `Shield: AC +${parts[1]}`;
      } else {
        data.desc = "General item";
      }
    });

    gameHooks.on("vendor:check_funds", async (data: any) => {
      const charObjs = await data.db.search({ id: data.actorId });
      const charObj = charObjs[0];
      if (charObj) {
        const sheet = migrateSheet((charObj.state as any).dnd);
        data.balance = sheet.gold || 0;
        data.hasFunds = sheet.gold >= data.price;
        data.currency = "gp";
      }
    });

    gameHooks.on("vendor:deduct_funds", async (data: any) => {
      const charObjs = await data.db.search({ id: data.actorId });
      const charObj = charObjs[0];
      if (charObj) {
        const sheet = migrateSheet((charObj.state as any).dnd);
        sheet.gold -= data.price;
        await data.db.modify(data.actorId, "$set", { "data.dnd": sheet });
        data.success = true;
        data.balance = sheet.gold;
      }
    });

    gameHooks.on("vendor:add_funds", async (data: any) => {
      const charObjs = await data.db.search({ id: data.actorId });
      const charObj = charObjs[0];
      if (charObj) {
        const sheet = migrateSheet((charObj.state as any).dnd);
        sheet.gold += data.amount;
        await data.db.modify(data.actorId, "$set", { "data.dnd": sheet });
        data.success = true;
        data.currency = "gp";
        data.balance = sheet.gold;
      }
    });

    gameHooks.on("vendor:check_equipped", async (data: any) => {
      const itemObjs = await data.db.search({ id: data.itemId });
      const item = itemObjs[0];
      if (item && (item.state as any).dnd?.equipped) {
        data.equipped = true;
      }
    });

    gameHooks.on("vendor:get_item_price", (data: any) => {
      const itemDnd = (data.item.state as any).dnd;
      if (itemDnd?.type === "weapon") {
        data.price = 10;
      } else if (itemDnd?.type === "armor" || itemDnd?.type === "shield") {
        data.price = 20;
      } else {
        data.price = 2;
      }
    });

    gameHooks.on("vendor:spawn_item", async (data: any) => {
      const parts = data.spec.split(":");
      const type = parts[0].toLowerCase();
      const dndData: Record<string, any> = {
        type,
        equipped: false
      };

      if (type === "weapon") {
        dndData.damage = parts[1] || "1d6";
        dndData.damageType = parts[2] || "slashing";
        dndData.properties = parts.slice(3).map((p: string) => p.toLowerCase());
        dndData.weaponType = dndData.properties.includes("ranged") ? "ranged" : "melee";
      } else if (type === "armor") {
        dndData.ac = parseInt(parts[1] || "11", 10);
        dndData.armorType = (parts[2] || "light").toLowerCase();
      } else if (type === "shield") {
        dndData.ac = parseInt(parts[1] || "2", 10);
        dndData.armorType = "shield";
      }

      await data.db.create({
        flags: new Set(["thing"]),
        location: data.actorId,
        name: data.itemName,
        state: {
          name: data.itemName,
          dnd: dndData,
          owner: data.actorId
        }
      });
      data.success = true;
    });

    return true;
  },

  remove: () => {
    removeDndCombat();
  },
};

export default plugin;

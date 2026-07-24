import { addCmd, type IUrsamuSDK, header, divider, footer } from "@ursamu/ursamu";
import { getAbilityMod, getProficiencyBonus, migrateSheet, defaultSheet } from "../stats/dnd_sheet.ts";

export interface CombatantInfo {
  id: string;
  name: string;
  initiative: number;
  dexMod: number;
}

export interface RoomCombatState {
  active: boolean;
  round: number;
  turnIndex: number;
  combatants: CombatantInfo[];
}

export interface DropConfig {
  item: string;
  chance: number;
  type: string;
  formula?: string;
}

const NPC_TEMPLATES: Record<
  string,
  {
    hp: number;
    ac: number;
    xp: number;
    abilities: Record<string, number>;
    drops?: DropConfig[];
  }
> = {
  goblin: {
    hp: 7,
    ac: 15,
    xp: 50,
    abilities: {
      strength: 8,
      dexterity: 14,
      constitution: 10,
      intelligence: 10,
      wisdom: 8,
      charisma: 8
    },
    drops: [
      {
        item: "Dagger",
        chance: 0.5,
        type: "weapon:1d4:piercing:finesse,thrown"
      },
      { item: "Gold Ring", chance: 0.3, type: "general" },
      { item: "Gold Coins", chance: 0.8, type: "general", formula: "2d6" }
    ]
  },
  orc: {
    hp: 15,
    ac: 13,
    xp: 100,
    abilities: {
      strength: 16,
      dexterity: 12,
      constitution: 16,
      intelligence: 7,
      wisdom: 11,
      charisma: 10
    },
    drops: [
      { item: "Greataxe", chance: 0.6, type: "weapon:1d12:slashing" },
      { item: "Hide Armor", chance: 0.4, type: "armor:12:medium" },
      { item: "Gold Coins", chance: 0.8, type: "general", formula: "3d6" }
    ]
  },
  zombie: {
    hp: 22,
    ac: 8,
    xp: 200,
    abilities: {
      strength: 13,
      dexterity: 6,
      constitution: 16,
      intelligence: 3,
      wisdom: 6,
      charisma: 5
    },
    drops: [
      { item: "Tattered Clothes", chance: 0.2, type: "general" }
    ]
  }
};

addCmd({
  name: "+npc/create",
  pattern: /^\+npc\/create\s+(.+)\s*=\s*(.*)/i,
  lock: "connected builder+",
  category: "Dnd",
  help: `+npc/create <name>=<template|stats>  -- Create NPC in the room.`,
  exec: async (u: IUrsamuSDK) => {
    const name = u.util.stripSubs(u.cmd.args[0]).trim();
    const spec = u.util.stripSubs(u.cmd.args[1]).trim().toLowerCase();

    if (!name || !spec) {
      u.send("Usage: +npc/create <name>=<template|stats>");
      return;
    }

    const roomId = u.me.location;
    if (!roomId) {
      u.send("You are not in a room.");
      return;
    }

    let hp = 10;
    let ac = 10;
    let xpVal = 50;
    let abVals = {
      strength: 10,
      dexterity: 10,
      constitution: 10,
      intelligence: 10,
      wisdom: 10,
      charisma: 10
    };
    let drops: DropConfig[] = [];

    if (NPC_TEMPLATES[spec]) {
      const t = NPC_TEMPLATES[spec];
      hp = t.hp;
      ac = t.ac;
      xpVal = t.xp;
      abVals = { ...abVals, ...t.abilities };
      drops = t.drops || [];
    } else {
      const parts = spec.split(":");
      if (parts.length < 8) {
        u.send(
          "Invalid template or stats format. Must be a template or " +
            "hp:ac:str:dex:con:int:wis:cha."
        );
        return;
      }
      hp = parseInt(parts[0], 10) || 10;
      ac = parseInt(parts[1], 10) || 10;
      abVals.strength = parseInt(parts[2], 10) || 10;
      abVals.dexterity = parseInt(parts[3], 10) || 10;
      abVals.constitution = parseInt(parts[4], 10) || 10;
      abVals.intelligence = parseInt(parts[5], 10) || 10;
      abVals.wisdom = parseInt(parts[6], 10) || 10;
      abVals.charisma = parseInt(parts[7], 10) || 10;
      xpVal = hp * 5;
    }

    const dndData = defaultSheet();
    dndData.class = "Monster";
    dndData.species = "NPC";
    dndData.background = "None";
    dndData.hp = { max: hp, current: hp, temp: 0 };
    dndData.ac = ac;
    dndData.abilities = abVals;
    dndData.xp = xpVal;
    (dndData as any).drops = drops;

    const thing = await u.db.create({
      flags: new Set(["thing"]),
      location: roomId,
      name,
      state: {
        name,
        dnd: dndData,
        owner: u.me.id
      }
    });

    u.send(`Created NPC ${name} (#${thing.id}) in this room.`);
  }
});

async function getRoomCombatState(u: IUrsamuSDK, roomId: string): Promise<RoomCombatState | null> {
  const rooms = await u.db.search({ id: roomId });
  const room = rooms[0];
  if (!room) return null;
  return ((room.state as any)?.combat as RoomCombatState) || null;
}

async function saveRoomCombatState(u: IUrsamuSDK, roomId: string, state: RoomCombatState) {
  await u.db.modify(roomId, "$set", { "data.combat": state });
}

async function resolveNpcAttack(u: IUrsamuSDK, npc: any, target: any, roomId: string) {
  const npcSheet = migrateSheet(npc.state.dnd);
  const targetSheet = migrateSheet(target.state.dnd);

  const templateKey = (npc.state.dnd.class === "Monster" ? npc.name.toLowerCase() : "") || "fallback";
  let weaponName = "Unarmed Strike";
  let damageDie = "1d4";
  let damageType = "bludgeoning";
  let useDex = false;

  if (templateKey.includes("goblin")) {
    weaponName = "Scimitar";
    damageDie = "1d6";
    damageType = "slashing";
    useDex = true;
  } else if (templateKey.includes("orc")) {
    weaponName = "Greataxe";
    damageDie = "1d12";
    damageType = "slashing";
    useDex = false;
  } else if (templateKey.includes("zombie")) {
    weaponName = "Slam";
    damageDie = "1d6";
    damageType = "bludgeoning";
    useDex = false;
  }

  const strMod = getAbilityMod(npcSheet.abilities.strength);
  const dexMod = getAbilityMod(npcSheet.abilities.dexterity);
  const attackMod = useDex ? dexMod : strMod;
  const attackAbilityLabel = useDex ? "Dex" : "Str";

  const profBonus = getProficiencyBonus(npcSheet.level);

  const d20 = Math.floor(Math.random() * 20) + 1;
  const attackTotal = d20 + attackMod + profBonus;

  // target AC calculation
  const targetItems = await u.db.search({ location: target.id });
  const targetArmor = targetItems.find(item => item.flags.has("thing") && (item.state as any).dnd?.type === "armor" && (item.state as any).dnd?.equipped);
  const targetShield = targetItems.find(item => item.flags.has("thing") && (item.state as any).dnd?.type === "shield" && (item.state as any).dnd?.equipped);
  const targetDexMod = getAbilityMod(targetSheet.abilities.dexterity);
  let targetAc = 10;
  if (targetArmor) {
    const armorAc = ((targetArmor.state as any).dnd.ac as number) || 10;
    const armorType = ((targetArmor.state as any).dnd.armorType as string) || "light";
    if (armorType === "light") {
      targetAc = armorAc + targetDexMod;
    } else if (armorType === "medium") {
      targetAc = armorAc + Math.min(2, targetDexMod);
    } else if (armorType === "heavy") {
      targetAc = armorAc;
    }
  } else {
    targetAc = 10 + targetDexMod;
  }
  if (targetShield) {
    targetAc += ((targetShield.state as any).dnd.ac as number) || 2;
  }

  const isCrit = d20 === 20;
  const hit = isCrit || attackTotal >= targetAc;
  const nameA = u.util.displayName(npc, u.me);
  const nameT = u.util.displayName(target, u.me);

  if (hit) {
    const match = damageDie.match(/^(\d+)[dD](\d+)$/);
    if (!match) return;
    const baseDiceCount = parseInt(match[1], 10);
    const diceSides = parseInt(match[2], 10);
    const diceCount = isCrit ? baseDiceCount * 2 : baseDiceCount;

    let dmgRoll = 0;
    const rolls: number[] = [];
    for (let i = 0; i < diceCount; i++) {
      const rVal = Math.floor(Math.random() * diceSides) + 1;
      rolls.push(rVal);
      dmgRoll += rVal;
    }
    const totalDmg = dmgRoll + attackMod;

    let remainingDmg = totalDmg;
    if (targetSheet.hp.temp > 0) {
      const absorb = Math.min(targetSheet.hp.temp, remainingDmg);
      targetSheet.hp.temp -= absorb;
      remainingDmg -= absorb;
    }
    targetSheet.hp.current = Math.max(0, targetSheet.hp.current - remainingDmg);

    await u.db.modify(target.id, "$set", { "data.dnd": targetSheet });

    const sign = attackMod >= 0 ? "+" : "";
    const dmgDetail =
      `${diceCount}d${diceSides}(${rolls.join(", ")})${sign}` +
      `${attackMod} (${attackAbilityLabel})`;
    const hpState =
      targetSheet.hp.current === 0 ? " -- %crUnconscious%cn!" : "";

    const hitLabel = isCrit ? "%ch%crCRITICAL HIT!%cn" : "%ch%cgHIT%cn!";

    u.broadcast(
      `%ch%ccROLL>>%cn ${nameA} attacks ${nameT} with %ch${weaponName}%cn: ` +
        `d20(${d20}) +${attackMod} +${profBonus} = ${attackTotal} vs ` +
        `AC ${targetAc}. ${hitLabel}`
    );
    u.broadcast(
      `%ch%ccROLL>>%cn ${nameA} rolls damage: ${dmgDetail} = ` +
        `%ch%cy${totalDmg}%cn ${damageType} damage to ${nameT} ` +
        `(${targetSheet.hp.current}/${targetSheet.hp.max})${hpState}`
    );
  } else {
    u.broadcast(`%ch%ccROLL>>%cn ${nameA} attacks ${nameT} with %ch${weaponName}%cn: d20(${d20}) +${attackMod} +${profBonus} = ${attackTotal} vs AC ${targetAc}. %ch%cyMISS%cn.`);
  }

  // Advance turn
  const cState = await getRoomCombatState(u, roomId);
  if (cState) {
    cState.turnIndex = (cState.turnIndex + 1) % cState.combatants.length;
    if (cState.turnIndex === 0) cState.round += 1;
    await saveRoomCombatState(u, roomId, cState);
    const nextC = cState.combatants[cState.turnIndex];
    u.broadcast(`Turn passed. Current round: ${cState.round}. It is now %ch%cg${nextC.name}%cn's turn.`);
  }
}

async function runNpcTurns(u: IUrsamuSDK, roomId: string) {
  let cState = await getRoomCombatState(u, roomId);
  if (!cState || !cState.active) return;

  let iterations = 0;
  while (cState && cState.active && iterations < 20) {
    iterations++;
    const activeC = cState.combatants[cState.turnIndex];
    const activeObjs = await u.db.search({ id: activeC.id });
    const activeObj = activeObjs[0];

    // If active combatant is a player, stop and wait for their input
    if (activeObj?.flags.has("player")) {
      break;
    }

    // Skip unconscious NPCs
    const npcSheet = (activeObj?.state as any)?.dnd;
    if (!npcSheet || npcSheet.hp.current <= 0) {
      cState.turnIndex = (cState.turnIndex + 1) % cState.combatants.length;
      if (cState.turnIndex === 0) cState.round += 1;
      await saveRoomCombatState(u, roomId, cState);
      u.broadcast(`NPC ${activeC.name} is unconscious and skips their turn.`);
      cState = await getRoomCombatState(u, roomId);
      continue;
    }

    // Find conscious player targets
    const potentialTargets: any[] = [];
    for (const c of cState.combatants) {
      const oList = await u.db.search({ id: c.id });
      const o = oList[0];
      if (o?.flags.has("player")) {
        const sheet = (o.state as any)?.dnd;
        if (sheet && sheet.hp.current > 0) {
          potentialTargets.push(o);
        }
      }
    }

    if (potentialTargets.length === 0) {
      u.broadcast(`No conscious players left. NPC ${activeC.name} cackles in victory.`);
      cState.turnIndex = (cState.turnIndex + 1) % cState.combatants.length;
      if (cState.turnIndex === 0) cState.round += 1;
      await saveRoomCombatState(u, roomId, cState);
      cState = await getRoomCombatState(u, roomId);
      continue;
    }

    // Select random conscious player to attack
    const targetObj = potentialTargets[Math.floor(Math.random() * potentialTargets.length)];
    await resolveNpcAttack(u, activeObj, targetObj, roomId);
    cState = await getRoomCombatState(u, roomId);
  }
}

addCmd({
  name: "+combat/start",
  pattern: /^\+combat\/start$/i,
  lock: "connected",
  category: "Dnd",
  help: `+combat/start  -- Start turn-based combat in the current room.`,
  exec: async (u: IUrsamuSDK) => {
    const roomId = u.me.location;
    if (!roomId) {
      u.send("You are not in a room.");
      return;
    }

    const items = await u.db.search({ location: roomId });
    const combatants: any[] = [];

    // Include players and things that have D&D sheets in the room
    for (const item of items) {
      if (item.flags.has("player") || item.flags.has("thing")) {
        const sheet = (item.state as any)?.dnd;
        if (sheet && sheet.abilities) {
          combatants.push(item);
        }
      }
    }

    // Include u.me if not already present
    if (!combatants.find(c => c.id === u.me.id)) {
      const meSheet = (u.me.state as any)?.dnd;
      if (meSheet && meSheet.abilities) {
        combatants.push(u.me);
      }
    }

    if (combatants.length === 0) {
      u.send("No eligible combatants with D&D character sheets found in this room.");
      return;
    }

    const combatantInfos: CombatantInfo[] = [];
    for (const c of combatants) {
      const sheet = migrateSheet((c.state as any).dnd);
      const dexMod = getAbilityMod(sheet.abilities.dexterity);
      const d20 = Math.floor(Math.random() * 20) + 1;
      const initiative = d20 + dexMod;
      combatantInfos.push({
        id: c.id,
        name: u.util.displayName(c, u.me),
        initiative,
        dexMod
      });
    }

    // Sort: initiative desc, then dexMod desc
    combatantInfos.sort((a, b) => b.initiative - a.initiative || b.dexMod - a.dexMod);

    const cState: RoomCombatState = {
      active: true,
      round: 1,
      turnIndex: 0,
      combatants: combatantInfos
    };

    await saveRoomCombatState(u, roomId, cState);

    const lines: string[] = [header("COMBAT STARTED"), `Round: 1` ];
    lines.push(divider("Initiative Order"));
    for (let i = 0; i < cState.combatants.length; i++) {
      const c = cState.combatants[i];
      const prefix = i === 0 ? " > " : "   ";
      lines.push(`${prefix}${u.util.ljust(c.name, 30)} (Init: ${c.initiative})`);
    }
    lines.push(footer());
    u.send(lines.join("\n"));

    // Trigger AI checks for NPC turns
    await runNpcTurns(u, roomId);
  }
});

addCmd({
  name: "+combat/join",
  pattern: /^\+combat\/join$/i,
  lock: "connected",
  category: "Dnd",
  help: `+combat/join  -- Join the active combat in this room.`,
  exec: async (u: IUrsamuSDK) => {
    const roomId = u.me.location;
    if (!roomId) {
      u.send("You are not in a room.");
      return;
    }

    const cState = await getRoomCombatState(u, roomId);
    if (!cState || !cState.active) {
      u.send("Combat is not active in this room.");
      return;
    }

    if (cState.combatants.find(c => c.id === u.me.id)) {
      u.send("You are already in combat.");
      return;
    }

    const sheet = migrateSheet((u.me.state as any).dnd);
    const dexMod = getAbilityMod(sheet.abilities.dexterity);
    const d20 = Math.floor(Math.random() * 20) + 1;
    const initiative = d20 + dexMod;

    const info: CombatantInfo = {
      id: u.me.id,
      name: u.util.displayName(u.me, u.me),
      initiative,
      dexMod
    };

    cState.combatants.push(info);
    cState.combatants.sort((a, b) => b.initiative - a.initiative || b.dexMod - a.dexMod);

    // Keep active turn pointing to the correct combatant ID
    await saveRoomCombatState(u, roomId, cState);
    u.send(`${info.name} joins combat! (Initiative: ${initiative})`);

    // Trigger AI in case it is an NPC's turn now
    await runNpcTurns(u, roomId);
  }
});

addCmd({
  name: "+combat/status",
  pattern: /^\+combat(?:\/status)?$/i,
  lock: "connected",
  category: "Dnd",
  help: `+combat/status  -- View active combat status in this room.`,
  exec: async (u: IUrsamuSDK) => {
    const roomId = u.me.location;
    if (!roomId) {
      u.send("You are not in a room.");
      return;
    }

    const cState = await getRoomCombatState(u, roomId);
    if (!cState || !cState.active) {
      u.send("No active combat in this room.");
      return;
    }

    const lines: string[] = [header("COMBAT STATUS"), `Round: ${cState.round}`];
    lines.push(divider("Initiative Queue"));

    for (let i = 0; i < cState.combatants.length; i++) {
      const c = cState.combatants[i];
      const isCurrent = i === cState.turnIndex;
      const prefix = isCurrent ? " %cg>%cn " : "   ";
      
      const targetObjs = await u.db.search({ id: c.id });
      const targetObj = targetObjs[0];
      let hpStr = "[N/A]";
      let statusStr = "Unknown";

      if (targetObj && (targetObj.state as any)?.dnd) {
        const sheet = migrateSheet((targetObj.state as any).dnd);
        hpStr = `[${sheet.hp.current}/${sheet.hp.max}]`;
        const pct = sheet.hp.current / sheet.hp.max;
        if (sheet.hp.current <= 0) {
          statusStr = "%crUnconscious%cn";
        } else if (pct <= 0.5) {
          statusStr = "%cyBloody%cn";
        } else if (pct < 1.0) {
          statusStr = "%cyWounded%cn";
        } else {
          statusStr = "%cgHealthy%cn";
        }
      }

      lines.push(`${prefix}${u.util.ljust(c.name, 22)}${u.util.ljust(hpStr, 12)}${u.util.ljust(statusStr, 20)} (Init: ${c.initiative})`);
    }

    lines.push(footer());
    u.send(lines.join("\n"));
  }
});

addCmd({
  name: "+combat/pass",
  pattern: /^\+combat\/(?:pass|next)$/i,
  lock: "connected",
  category: "Dnd",
  help: `+combat/pass  -- Pass the current turn in combat.`,
  exec: async (u: IUrsamuSDK) => {
    const roomId = u.me.location;
    if (!roomId) {
      u.send("You are not in a room.");
      return;
    }

    const cState = await getRoomCombatState(u, roomId);
    if (!cState || !cState.active) {
      u.send("Combat is not active in this room.");
      return;
    }

    const currentCombatant = cState.combatants[cState.turnIndex];
    
    // Only the current combatant or staff/builder can pass the turn
    const isStaff = u.me.flags.has("admin") || u.me.flags.has("wizard");
    if (u.me.id !== currentCombatant.id && !isStaff) {
      u.send("It is not your turn to pass.");
      return;
    }

    cState.turnIndex = (cState.turnIndex + 1) % cState.combatants.length;
    if (cState.turnIndex === 0) {
      cState.round += 1;
    }

    await saveRoomCombatState(u, roomId, cState);

    const nextC = cState.combatants[cState.turnIndex];
    u.send(`Turn passed. Current round: ${cState.round}. It is now %ch%cg${nextC.name}%cn's turn.`);

    // Run NPC turns if applicable
    await runNpcTurns(u, roomId);
  }
});

addCmd({
  name: "+combat/end",
  pattern: /^\+combat\/end$/i,
  lock: "connected",
  category: "Dnd",
  help: `+combat/end  -- End the active combat in this room.`,
  exec: async (u: IUrsamuSDK) => {
    const roomId = u.me.location;
    if (!roomId) {
      u.send("You are not in a room.");
      return;
    }

    const cState = await getRoomCombatState(u, roomId);
    if (!cState || !cState.active) {
      u.send("No active combat in this room.");
      return;
    }

    await u.db.modify(roomId, "$unset", { "data.combat": "" });
    u.send("Combat has ended.");
  }
});

addCmd({
  name: "+attack",
  pattern: /^\+attack\s+(.*)/i,
  lock: "connected",
  category: "Dnd",
  help: `+attack <target>  -- Attack a target in the active room combat.`,
  exec: async (u: IUrsamuSDK) => {
    const roomId = u.me.location;
    if (!roomId) {
      u.send("You are not in a room.");
      return;
    }

    const cState = await getRoomCombatState(u, roomId);
    if (!cState || !cState.active) {
      u.send("Combat is not active in this room. Start it with +combat/start.");
      return;
    }

    const currentCombatant = cState.combatants[cState.turnIndex];
    if (u.me.id !== currentCombatant.id) {
      u.send("It is not your turn.");
      return;
    }

    const targetArg = u.util.stripSubs(u.cmd.args[0] || "").trim();
    const targetObj = await u.util.target(u.me, targetArg);

    if (!targetObj || targetObj.location !== roomId) {
      u.send("That target is not here.");
      return;
    }

    const attackerSheet = migrateSheet((u.me.state as any).dnd);
    const targetSheetObj = (targetObj.state as any)?.dnd;
    if (!targetSheetObj) {
      u.send("That target does not have a character sheet and cannot be attacked.");
      return;
    }
    const targetSheet = migrateSheet(targetSheetObj);

    // Roll Weapon Attack
    const items = await u.db.search({ location: u.me.id });
    const weapon = items.find(item => item.flags.has("thing") && (item.state as any).dnd?.type === "weapon" && (item.state as any).dnd?.equipped);

    const strMod = getAbilityMod(attackerSheet.abilities.strength);
    const dexMod = getAbilityMod(attackerSheet.abilities.dexterity);
    const profBonus = getProficiencyBonus(attackerSheet.level);

    let attackMod = strMod;
    let attackAbilityLabel = "Str";
    let weaponName = "Unarmed Strike";
    let damageDie = "1d4";
    let damageType = "bludgeoning";

    if (weapon) {
      weaponName = weapon.name || "Weapon";
      damageDie = ((weapon.state as any).dnd.damage as string) || "1d6";
      damageType = ((weapon.state as any).dnd.damageType as string) || "slashing";
      const props = ((weapon.state as any).dnd.properties as string[]) || [];
      const weaponType = ((weapon.state as any).dnd.weaponType as string) || "melee";
      
      if (weaponType === "ranged") {
        attackMod = dexMod;
        attackAbilityLabel = "Dex";
      } else if (props.includes("finesse")) {
        if (dexMod > strMod) {
          attackMod = dexMod;
          attackAbilityLabel = "Dex";
        } else {
          attackMod = strMod;
          attackAbilityLabel = "Str";
        }
      } else {
        attackMod = strMod;
        attackAbilityLabel = "Str";
      }
    }

    const isUnarmed = !weapon;
    const profTerm = isUnarmed ? 0 : profBonus;

    const d20 = Math.floor(Math.random() * 20) + 1;
    const attackTotal = d20 + attackMod + profTerm;

    // Calculate target AC dynamically
    const targetItems = await u.db.search({ location: targetObj.id });
    const targetArmor = targetItems.find(item => item.flags.has("thing") && (item.state as any).dnd?.type === "armor" && (item.state as any).dnd?.equipped);
    const targetShield = targetItems.find(item => item.flags.has("thing") && (item.state as any).dnd?.type === "shield" && (item.state as any).dnd?.equipped);

    const targetDexMod = getAbilityMod(targetSheet.abilities.dexterity);
    let targetAc = 10;
    if (targetArmor) {
      const armorAc = ((targetArmor.state as any).dnd.ac as number) || 10;
      const armorType = ((targetArmor.state as any).dnd.armorType as string) || "light";
      if (armorType === "light") {
        targetAc = armorAc + targetDexMod;
      } else if (armorType === "medium") {
        targetAc = armorAc + Math.min(2, targetDexMod);
      } else if (armorType === "heavy") {
        targetAc = armorAc;
      }
    } else {
      targetAc = 10 + targetDexMod;
    }

    if (targetShield) {
      targetAc += ((targetShield.state as any).dnd.ac as number) || 2;
    }

    const isCrit = d20 === 20;
    const hit = isCrit || attackTotal >= targetAc;
    const nameA = u.util.displayName(u.me, u.me);
    const nameT = u.util.displayName(targetObj, u.me);

    if (hit) {
      // Roll damage
      const match = damageDie.match(/^(\d+)[dD](\d+)$/);
      if (!match) {
        u.send(`Error: Invalid damage die formula: "${damageDie}"`);
        return;
      }
      const baseDiceCount = parseInt(match[1], 10);
      const diceSides = parseInt(match[2], 10);
      const diceCount = isCrit ? baseDiceCount * 2 : baseDiceCount;

      let dmgRoll = 0;
      const rolls: number[] = [];
      for (let i = 0; i < diceCount; i++) {
        const rVal = Math.floor(Math.random() * diceSides) + 1;
        rolls.push(rVal);
        dmgRoll += rVal;
      }

      const totalDmg = dmgRoll + attackMod;
      
      // Apply damage
      let remainingDmg = totalDmg;
      if (targetSheet.hp.temp > 0) {
        const absorb = Math.min(targetSheet.hp.temp, remainingDmg);
        targetSheet.hp.temp -= absorb;
        remainingDmg -= absorb;
      }
      targetSheet.hp.current = Math.max(0, targetSheet.hp.current - remainingDmg);

      await u.db.modify(targetObj.id, "$set", { "data.dnd": targetSheet });

      const sign = attackMod >= 0 ? "+" : "";
      const dmgDetail =
        `${diceCount}d${diceSides}(${rolls.join(", ")})${sign}` +
        `${attackMod} (${attackAbilityLabel})`;
      const hpState =
        targetSheet.hp.current === 0 ? " -- %crUnconscious%cn!" : "";

      const hitLabel = isCrit ? "%ch%crCRITICAL HIT!%cn" : "%ch%cgHIT%cn!";

      u.send(
        `%ch%ccROLL>>%cn ${nameA} attacks ${nameT} with %ch${weaponName}%cn: ` +
          `d20(${d20}) +${attackMod} +${profTerm} = ${attackTotal} vs ` +
          `AC ${targetAc}. ${hitLabel}`
      );
      u.send(
        `%ch%ccROLL>>%cn ${nameA} rolls damage: ${dmgDetail} = ` +
          `%ch%cy${totalDmg}%cn ${damageType} damage to ${nameT} ` +
          `(${targetSheet.hp.current}/${targetSheet.hp.max})${hpState}`
      );
    } else {
      u.send(`%ch%ccROLL>>%cn ${nameA} attacks ${nameT} with %ch${weaponName}%cn: d20(${d20}) +${attackMod} +${profTerm} = ${attackTotal} vs AC ${targetAc}. %ch%cyMISS%cn.`);
    }

    // Auto pass turn
    cState.turnIndex = (cState.turnIndex + 1) % cState.combatants.length;
    if (cState.turnIndex === 0) {
      cState.round += 1;
    }
    await saveRoomCombatState(u, roomId, cState);

    const nextC = cState.combatants[cState.turnIndex];
    u.send(`Turn passed. Current round: ${cState.round}. It is now %ch%cg${nextC.name}%cn's turn.`);

    // Run NPC turns if applicable
    await runNpcTurns(u, roomId);
  }
});

addCmd({
  name: "+kill",
  pattern: /^\+kill\s+(.*)/i,
  lock: "connected",
  category: "Dnd",
  help:
    `+kill <target>  -- Execute an unconscious NPC ` +
    `to gain XP and drop a corpse.`,
  exec: async (u: IUrsamuSDK) => {
    const roomId = u.me.location;
    if (!roomId) {
      u.send("You are not in a room.");
      return;
    }

    const targetArg = u.util.stripSubs(u.cmd.args[0] || "").trim();
    const targetObj = await u.util.target(u.me, targetArg);

    if (!targetObj || targetObj.location !== roomId) {
      u.send("That target is not here.");
      return;
    }

    const targetSheetObj = (targetObj.state as any)?.dnd;
    if (!targetSheetObj) {
      u.send("That target does not have a character sheet.");
      return;
    }

    const targetSheet = migrateSheet(targetSheetObj);
    if (targetSheet.class !== "Monster") {
      u.send("You can only execute NPCs/Monsters.");
      return;
    }

    if (targetSheet.hp.current > 0) {
      u.send(
        `${u.util.displayName(targetObj, u.me)} is still standing! ` +
          `You must reduce them to 0 HP first.`
      );
      return;
    }

    // Award XP
    const npcXp = targetSheet.xp || 50;
    const playerSheet = migrateSheet((u.me.state as any).dnd);
    playerSheet.xp = (playerSheet.xp || 0) + npcXp;
    await u.db.modify(u.me.id, "$set", { "data.dnd": playerSheet });

    const DEATH_FLAVORS = [
      "delivers a decapitating blow, executing",
      "drives their blade through the heart of, executing",
      "crushes the skull of, executing",
      "delivers a fatal strike, executing",
      "lands a perfect death blow on, executing"
    ];
    const flavor =
      DEATH_FLAVORS[Math.floor(Math.random() * DEATH_FLAVORS.length)];

    u.broadcast(
      `%ch%cgKILL>>%cn ${u.util.displayName(u.me, u.me)} ${flavor} ` +
        `${u.util.displayName(targetObj, u.me)}!`
    );
    u.send(`You gain ${npcXp} XP.`);

    // Spawn corpse container and transfer NPC carried items + drops to it
    const CORPSE_PREFIXES = [
      "lifeless body of",
      "mangled corpse of",
      "bloodied remains of",
      "battered corpse of"
    ];
    const prefix =
      CORPSE_PREFIXES[Math.floor(Math.random() * CORPSE_PREFIXES.length)];
    const corpseName = `${prefix} ${targetObj.name || "Monster"}`;
    const capCorpseName =
      corpseName.charAt(0).toUpperCase() + corpseName.slice(1);

    const CORPSE_DESCS = [
      `The blood-spattered remains of ` +
        `${u.util.displayName(targetObj, u.me)}. Flies circle.`,
      `The lifeless form of ` +
        `${u.util.displayName(targetObj, u.me)}, cold to the touch.`,
      `The battered body of ` +
        `${u.util.displayName(targetObj, u.me)} in a pool of blood.`,
      `The quiet remains of ` +
        `${u.util.displayName(targetObj, u.me)}, staring blankly.`
    ];
    const corpseDesc =
      CORPSE_DESCS[Math.floor(Math.random() * CORPSE_DESCS.length)];

    const tName = targetObj.name || "Monster";
    const dbName =
      `${capCorpseName};corpse;corpse of ${tName};` +
      `remains of ${tName};body of ${tName};${tName} corpse`;

    const corpse = await u.db.create({
      flags: new Set(["thing"]),
      location: roomId,
      name: dbName,
      state: {
        name: capCorpseName,
        desc: corpseDesc,
        dnd: { type: "corpse" }
      }
    });

    let hasLoot = false;

    // Roll drop table
    const drops: DropConfig[] = (targetSheet as any).drops || [];
    for (const drop of drops) {
      if (Math.random() <= drop.chance) {
        hasLoot = true;
        const dndData: Record<string, any> = {
          type: drop.type,
          equipped: false
        };
        const parts = drop.type.split(":");
        const itemType = parts[0];
        if (itemType === "weapon") {
          dndData.damage = parts[1] || "1d6";
          dndData.damageType = parts[2] || "slashing";
          dndData.properties = parts.slice(3).map((p) => p.toLowerCase());
          dndData.weaponType = dndData.properties.includes("ranged")
            ? "ranged"
            : "melee";
        } else if (itemType === "armor") {
          dndData.ac = parseInt(parts[1] || "11", 10);
          dndData.armorType = (parts[2] || "light").toLowerCase();
        } else if (itemType === "shield") {
          dndData.ac = parseInt(parts[1] || "2", 10);
          dndData.armorType = "shield";
        } else {
          dndData.type = "general";
        }

        let finalName = drop.item;
        if (drop.item === "Gold Coins" && drop.formula) {
          const match = drop.formula.match(/^(\d+)[dD](\d+)$/);
          if (match) {
            const count = parseInt(match[1], 10);
            const sides = parseInt(match[2], 10);
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
          location: corpse.id,
          name: finalName,
          state: {
            name: finalName,
            dnd: dndData,
            owner: u.me.id
          }
        });
      }
    }

    const carriedItems = await u.db.search({ location: targetObj.id });
    if (carriedItems.length > 0) {
      hasLoot = true;
      for (const item of carriedItems) {
        if (item.flags.has("thing")) {
          if ((item.state as any).dnd) {
            (item.state as any).dnd.equipped = false;
          }
          await u.db.modify(item.id, "$set", {
            location: corpse.id,
            "data.dnd.equipped": false
          });
        }
      }
    }

    u.broadcast(`${capCorpseName} is left on the ground.`);

    // Remove from combat initiative queue
    const cState = await getRoomCombatState(u, roomId);
    if (cState && cState.active) {
      cState.combatants = cState.combatants.filter(
        (c) => c.id !== targetObj.id
      );
      if (cState.turnIndex >= cState.combatants.length) {
        cState.turnIndex = 0;
      }
      await saveRoomCombatState(u, roomId, cState);

      // Check if any Monsters remain in the combat queue
      let monsterCount = 0;
      for (const c of cState.combatants) {
        const oList = await u.db.search({ id: c.id });
        const o = oList[0];
        if (o && (o.state as any)?.dnd?.class === "Monster") {
          monsterCount++;
        }
      }

      if (monsterCount === 0) {
        await u.db.modify(roomId, "$unset", { "data.combat": "" });
        u.broadcast("All enemies have been defeated! Combat has ended.");
      }
    }

    // Destroy target object
    await u.db.destroy(targetObj.id);
  }
});

addCmd({
  name: "+loot",
  pattern: /^\+loot\s+(.*)/i,
  lock: "connected",
  category: "Dnd",
  help: `+loot <corpse>  -- Loot all items from a corpse in the room.`,
  exec: async (u: IUrsamuSDK) => {
    const roomId = u.me.location;
    if (!roomId) {
      u.send("You are not in a room.");
      return;
    }

    const targetArg = u.util.stripSubs(u.cmd.args[0] || "").trim();
    const targetObj = await u.util.target(u.me, targetArg);

    if (!targetObj || targetObj.location !== roomId) {
      u.send(`That corpse "${targetArg}" is not here.`);
      return;
    }

    const nameLc = targetObj.name?.toLowerCase() || "";
    const isCorpse =
      (targetObj.state as any)?.dnd?.type === "corpse" ||
      nameLc.includes("corpse of") ||
      nameLc.includes("remains of") ||
      nameLc.includes("body of");

    if (!isCorpse) {
      u.send("That is not a corpse.");
      return;
    }

    const items = await u.db.search({ location: targetObj.id });
    if (items.length === 0) {
      u.send("There is nothing to loot on the corpse.");
      await u.db.destroy(targetObj.id);
      return;
    }

    const lootNames: string[] = [];
    const playerSheet = migrateSheet((u.me.state as any).dnd);
    let goldGained = 0;

    for (const item of items) {
      if (item.flags.has("thing")) {
        const itemLc = item.name?.toLowerCase() || "";
        if (itemLc.includes("gold coins")) {
          const val =
            ((item.state as any).dnd?.value as number) ||
            parseInt(item.name || "", 10) ||
            0;
          goldGained += val;
          await u.db.destroy(item.id);
        } else {
          await u.db.modify(item.id, "$set", { location: u.me.id });
          lootNames.push(item.name || "Item");
        }
      }
    }

    if (goldGained > 0) {
      playerSheet.gold = (playerSheet.gold || 0) + goldGained;
      await u.db.modify(u.me.id, "$set", { "data.dnd": playerSheet });
      lootNames.push(`${goldGained} gp`);
    }

    const displayName = u.util.displayName(targetObj, u.me);
    u.send(`You loot ${lootNames.join(", ")} from ${displayName}.`);
    u.broadcast(
      `${u.util.displayName(u.me, u.me)} loots ${displayName}.`,
      { exclude: [u.me.id] } as Record<string, unknown>
    );

    await u.db.destroy(targetObj.id);
  }
});

addCmd({
  name: "+cast",
  pattern: /^\+cast\s+([^=]+?)(?:\s+on\s+(.+))?$/i,
  lock: "connected",
  category: "Dnd",
  help: `+cast <spell> [on <target>]  -- Cast a spell from your sheet.`,
  exec: async (u: IUrsamuSDK) => {
    const roomId = u.me.location;
    if (!roomId) {
      u.send("You are not in a room.");
      return;
    }

    const spellArg = u.util.stripSubs(u.cmd.args[0] || "").trim();
    const targetArg = u.util.stripSubs(u.cmd.args[1] || "").trim();

    // Check if in combat and it is the caster's turn
    const cState = await getRoomCombatState(u, roomId);
    if (cState && cState.active) {
      const currentCombatant = cState.combatants[cState.turnIndex];
      if (u.me.id !== currentCombatant.id) {
        u.send("It is not your turn.");
        return;
      }
    }

    const casterSheet = migrateSheet((u.me.state as any).dnd);
    const spellNameLower = spellArg.toLowerCase();

    // Check if caster knows the spell
    const knowsSpell = casterSheet.spells.some(
      (s) => s.toLowerCase() === spellNameLower
    );
    if (!knowsSpell && casterSheet.class !== "Monster") {
      u.send(`You do not know the spell "${spellArg}".`);
      return;
    }

    // Check spell slots (assuming 1st level spells for simplicity)
    const slotLevel = 1;
    if (
      casterSheet.spellSlotsCurrent[slotLevel] <= 0 &&
      casterSheet.class !== "Monster"
    ) {
      u.send(`You do not have any Level ${slotLevel} spell slots remaining.`);
      return;
    }

    // Determine target
    let targetObj = u.me;
    if (targetArg) {
      const found = await u.util.target(u.me, targetArg);
      if (!found || found.location !== roomId) {
        u.send("That target is not here.");
        return;
      }
      targetObj = found;
    }

    const targetSheetObj = (targetObj.state as any)?.dnd;
    if (!targetSheetObj) {
      u.send("That target does not have a character sheet.");
      return;
    }
    const targetSheet = migrateSheet(targetSheetObj);

    // Consume slot
    if (casterSheet.class !== "Monster") {
      casterSheet.spellSlotsCurrent[slotLevel] -= 1;
      await u.db.modify(u.me.id, "$set", { "data.dnd": casterSheet });
    }

    const nameA = u.util.displayName(u.me, u.me);
    const nameT = u.util.displayName(targetObj, u.me);

    if (spellNameLower === "cure wounds") {
      // 1d8 + Wisdom modifier
      const wisMod = getAbilityMod(casterSheet.abilities.wisdom);
      const d8 = Math.floor(Math.random() * 8) + 1;
      const healAmount = d8 + wisMod;
      targetSheet.hp.current = Math.min(
        targetSheet.hp.max,
        targetSheet.hp.current + healAmount
      );
      await u.db.modify(targetObj.id, "$set", { "data.dnd": targetSheet });

      u.broadcast(
        `%ch%cgCAST>>%cn ${nameA} casts %chCure Wounds%cn on ${nameT}: ` +
          `1d8(${d8}) + ${wisMod} (Wis) = %ch%cg${healAmount}%cn HP ` +
          `healed (${targetSheet.hp.current}/${targetSheet.hp.max} HP).`
      );
    } else if (spellNameLower === "guiding bolt") {
      // Spell attack: d20 + Wis + Prof vs target AC
      const wisMod = getAbilityMod(casterSheet.abilities.wisdom);
      const prof = getProficiencyBonus(casterSheet.level);
      const attackMod = wisMod;
      const d20 = Math.floor(Math.random() * 20) + 1;
      const attackTotal = d20 + attackMod + prof;

      // target AC calculation
      const targetItems = await u.db.search({ location: targetObj.id });
      const targetArmor = targetItems.find(
        (item) =>
          item.flags.has("thing") &&
          (item.state as any).dnd?.type === "armor" &&
          (item.state as any).dnd?.equipped
      );
      const targetShield = targetItems.find(
        (item) =>
          item.flags.has("thing") &&
          (item.state as any).dnd?.type === "shield" &&
          (item.state as any).dnd?.equipped
      );
      const targetDexMod = getAbilityMod(targetSheet.abilities.dexterity);
      let targetAc = 10;
      if (targetArmor) {
        const armorAc = ((targetArmor.state as any).dnd.ac as number) || 10;
        const armorType =
          ((targetArmor.state as any).dnd.armorType as string) || "light";
        if (armorType === "light") {
          targetAc = armorAc + targetDexMod;
        } else if (armorType === "medium") {
          targetAc = armorAc + Math.min(2, targetDexMod);
        } else if (armorType === "heavy") {
          targetAc = armorAc;
        }
      } else {
        targetAc = 10 + targetDexMod;
      }
      if (targetShield) {
        targetAc += ((targetShield.state as any).dnd.ac as number) || 2;
      }

      const isCrit = d20 === 20;
      const hit = isCrit || attackTotal >= targetAc;

      if (hit) {
        const baseDice = 4;
        const diceCount = isCrit ? baseDice * 2 : baseDice;
        let dmgRoll = 0;
        const rolls: number[] = [];
        for (let i = 0; i < diceCount; i++) {
          const r = Math.floor(Math.random() * 6) + 1;
          rolls.push(r);
          dmgRoll += r;
        }

        let remainingDmg = dmgRoll;
        if (targetSheet.hp.temp > 0) {
          const absorb = Math.min(targetSheet.hp.temp, remainingDmg);
          targetSheet.hp.temp -= absorb;
          remainingDmg -= absorb;
        }
        targetSheet.hp.current = Math.max(
          0,
          targetSheet.hp.current - remainingDmg
        );
        await u.db.modify(targetObj.id, "$set", { "data.dnd": targetSheet });

        const hpState =
          targetSheet.hp.current === 0 ? " -- %crUnconscious%cn!" : "";
        const hitLabel = isCrit ? "%ch%crCRITICAL HIT!%cn" : "%ch%cgHIT%cn!";

        u.broadcast(
          `%ch%cgCAST>>%cn ${nameA} casts %chGuiding Bolt%cn at ${nameT}: ` +
            `d20(${d20}) + ${attackMod} + ${prof} = ${attackTotal} vs ` +
            `AC ${targetAc}. ${hitLabel}`
        );
        u.broadcast(
          `%ch%ccROLL>>%cn Spell damage: ${diceCount}d6(${rolls.join(
            ", "
          )}) = ` +
            `%ch%cy${dmgRoll}%cn radiant damage to ${nameT} ` +
            `(${targetSheet.hp.current}/${targetSheet.hp.max})${hpState}`
        );
      } else {
        u.broadcast(
          `%ch%cgCAST>>%cn ${nameA} casts %chGuiding Bolt%cn at ${nameT}: ` +
            `d20(${d20}) + ${attackMod} + ${prof} = ${attackTotal} vs ` +
            `AC ${targetAc}. %ch%cyMISS%cn.`
        );
      }
    } else {
      u.broadcast(
        `%ch%cgCAST>>%cn ${nameA} casts %ch${spellArg}%cn on ${nameT}!`
      );
    }

    // Auto pass turn in combat
    if (cState && cState.active) {
      cState.turnIndex = (cState.turnIndex + 1) % cState.combatants.length;
      if (cState.turnIndex === 0) cState.round += 1;
      await saveRoomCombatState(u, roomId, cState);
      const nextC = cState.combatants[cState.turnIndex];
      u.send(
        `Turn passed. Current round: ${cState.round}. ` +
          `It is now %ch%cg${nextC.name}%cn's turn.`
      );
      await runNpcTurns(u, roomId);
    }
  }
});

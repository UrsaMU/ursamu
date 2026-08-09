/**
 * Walker-backed +combat commands (+npc/create).
 * Attack/kill/loot/cast live in their own modules — do not
 * re-register them here (legacy room-state combat is gone).
 */
import { addCmd, type IUrsamuSDK } from "@ursamu/ursamu";
import { currentActor } from "@ursamu/combat";
import { defaultSheet } from "../stats/dnd_sheet.ts";
import { NPC_TEMPLATES } from "../combat/npc-templates.ts";
import { attacksFromTemplate } from "../combat/npc-attacks.ts";
import { startRoomFight } from "../combat/start-fight.ts";
import {
  announceTurn,
  beginAndWalk,
  endRoomFight,
  formatStartBanner,
  formatStatus,
  joinActor,
  passAndWalk,
  roomEncounter,
  roomIdOf,
} from "../combat/session.ts";

addCmd({
  name: "+npc/create",
  pattern: /^\+npc\/create\s+(.+)\s*=\s*(.*)/i,
  lock: "connected builder+",
  category: "Dnd",
  help: `+npc/create <name>=<template|stats>  — Spawn NPC here.

Templates: goblin, orc, zombie, … (see catalog).
Or hp:ac:str:dex:con:int:wis:cha.`,
  exec: async (u: IUrsamuSDK) => {
    const name = u.util.stripSubs(u.cmd.args[0]).trim();
    const spec = u.util.stripSubs(u.cmd.args[1]).trim()
      .toLowerCase();
    if (!name || !spec) {
      u.send("Usage: +npc/create <name>=<template|stats>");
      return;
    }
    const roomId = roomIdOf(u);
    if (!roomId) {
      u.send("You are not in a room.");
      return;
    }

    const dndData = defaultSheet();
    dndData.class = "Monster";
    dndData.species = "NPC";
    // deno-lint-ignore no-explicit-any
    (dndData as any).aiKey = "aggressive";

    const t = NPC_TEMPLATES[spec];
    if (t) {
      dndData.hp = { max: t.hp, current: t.hp, temp: 0 };
      dndData.ac = t.ac;
      dndData.xp = t.xp;
      dndData.abilities = {
        strength: t.abilities.strength ?? 10,
        dexterity: t.abilities.dexterity ?? 10,
        constitution: t.abilities.constitution ?? 10,
        intelligence: t.abilities.intelligence ?? 10,
        wisdom: t.abilities.wisdom ?? 10,
        charisma: t.abilities.charisma ?? 10,
      };
      // deno-lint-ignore no-explicit-any
      (dndData as any).drops = t.drops || [];
      // deno-lint-ignore no-explicit-any
      (dndData as any).npcTemplate = spec;
      // deno-lint-ignore no-explicit-any
      (dndData as any).attacks = attacksFromTemplate(t);
    } else {
      const parts = spec.split(":");
      if (parts.length < 8) {
        u.send(
          "Use a template name or " +
            "hp:ac:str:dex:con:int:wis:cha.",
        );
        return;
      }
      const hp = parseInt(parts[0], 10) || 10;
      dndData.hp = { max: hp, current: hp, temp: 0 };
      dndData.ac = parseInt(parts[1], 10) || 10;
      dndData.abilities = {
        strength: parseInt(parts[2], 10) || 10,
        dexterity: parseInt(parts[3], 10) || 10,
        constitution: parseInt(parts[4], 10) || 10,
        intelligence: parseInt(parts[5], 10) || 10,
        wisdom: parseInt(parts[6], 10) || 10,
        charisma: parseInt(parts[7], 10) || 10,
      };
      dndData.xp = hp * 5;
    }

    const thing = await u.db.create({
      flags: new Set(["thing", "npc"]),
      location: roomId,
      name,
      state: {
        name,
        dnd: dndData,
        owner: u.me.id,
      },
    });
    u.send(`Created NPC ${name} (#${thing.id}) here.`);
  },
});

addCmd({
  name: "+combat/start",
  pattern: /^\+combat\/start$/i,
  lock: "connected",
  category: "Dnd",
  help: `+combat/start  — Start room combat (walker + NPC AI).`,
  exec: async (u: IUrsamuSDK) => {
    const r = await startRoomFight(u);
    if (!r.ok) {
      u.send(r.message || "Could not start combat.");
    }
  },
});

addCmd({
  name: "+combat/join",
  pattern: /^\+combat\/join$/i,
  lock: "connected",
  category: "Dnd",
  help: `+combat/join  — Join the active encounter here.`,
  exec: async (u: IUrsamuSDK) => {
    const roomId = roomIdOf(u);
    if (!roomId) {
      u.send("You are not in a room.");
      return;
    }
    let enc = await roomEncounter(roomId);
    if (!enc || enc.status === "resolved") {
      u.send("No open encounter. +combat/start first.");
      return;
    }
    // deno-lint-ignore no-explicit-any
    if (!(u.me.state as any)?.dnd?.abilities) {
      u.send("You need a D&D sheet to join.");
      return;
    }
    enc = (await joinActor(enc.id, u.me, u)) ?? enc;
    if (enc.status === "intent") {
      enc = (await beginAndWalk(u, enc.id)) ?? enc;
      if (enc) u.send(formatStartBanner(enc));
    } else {
      u.send("You join the fray!");
      if (enc.status === "active") announceTurn(u, enc);
    }
  },
});

addCmd({
  name: "+combat/status",
  pattern: /^\+combat(?:\/status)?$/i,
  lock: "connected",
  category: "Dnd",
  help: `+combat[/status]  — Initiative and HP bands.`,
  exec: async (u: IUrsamuSDK) => {
    const roomId = roomIdOf(u);
    if (!roomId) {
      u.send("You are not in a room.");
      return;
    }
    const enc = await roomEncounter(roomId);
    if (!enc || enc.status === "resolved") {
      u.send("No active combat in this room.");
      return;
    }
    const actors = new Map();
    for (const p of enc.participants) {
      // deno-lint-ignore no-explicit-any
      const found = await u.db.search({ id: p.actorId } as any);
      if (found[0]) actors.set(p.actorId, found[0]);
    }
    u.send(formatStatus(u, enc, actors));
  },
});

addCmd({
  name: "+combat/pass",
  pattern: /^\+combat\/(?:pass|next)$/i,
  lock: "connected",
  category: "Dnd",
  help: `+combat/pass  — End your turn; NPCs act until next PC.`,
  exec: async (u: IUrsamuSDK) => {
    const roomId = roomIdOf(u);
    if (!roomId) {
      u.send("You are not in a room.");
      return;
    }
    const enc = await roomEncounter(roomId);
    if (!enc || enc.status !== "active") {
      u.send("Combat is not active in this room.");
      return;
    }
    const cur = currentActor(enc);
    if (!cur || cur.actorId !== u.me.id) {
      u.send("It is not your turn.");
      return;
    }
    await passAndWalk(u, enc.id, u.me.id);
  },
});

addCmd({
  name: "+combat/end",
  pattern: /^\+combat\/end$/i,
  lock: "connected",
  category: "Dnd",
  help: `+combat/end  — Force-end encounter (staff).`,
  exec: async (u: IUrsamuSDK) => {
    const roomId = roomIdOf(u);
    if (!roomId) {
      u.send("You are not in a room.");
      return;
    }
    const enc = await roomEncounter(roomId);
    if (!enc || enc.status === "resolved") {
      u.send("No active combat in this room.");
      return;
    }
    const staff = u.me.flags.has("admin") ||
      u.me.flags.has("wizard") ||
      u.me.flags.has("superuser");
    if (!staff) {
      u.send("Only staff can force-end combat.");
      return;
    }
    await endRoomFight(u, enc);
  },
});

import { addCmd, dbojs, gameHooks, hydrate } from "@ursamu/mush";
import type { IUrsamuSDK, IDBObj } from "@ursamu/mush";
import { scenes } from "./db.ts";
import type { IScene, IScenePose } from "./types.ts";
import { DBO } from "@ursamu/mush";

// Helper to check if staff
function isStaff(u: IUrsamuSDK): boolean {
  return u.me.flags.has("admin") || u.me.flags.has("wizard") || u.me.flags.has("superuser");
}

addCmd({
  name: "+scene",
  pattern: /^\+scene(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Social",
  help: `+scene[/<switch>] <args>  — Create and manage roleplay scenes in instanced rooms.

Switches:
  /start [<template_room>=]<title>/<desc> — Start a new scene in the specified room template (defaults to here).
  /join <scene_id>    — Join a scene and teleport to its instanced room.
  /leave              — Leave the current scene and return to your pre-scene location.
  /list               — List all active roleplay scenes.
  /log <scene_id>     — View the log of a scene.
  /link <scene_id>=<discord_channel_id> — Link a Discord channel to the scene (owner/staff only).
  /end <scene_id>     — End a scene, clean up the instanced room, and post logs to the BBS.

Examples:
  +scene/start The Tavern/A noisy evening RP.
  +scene/start #12=The Tavern/A noisy evening RP.
  +scene/join 1
  +scene/leave
  +scene/list
  +scene/end 1`,
  exec: async (u: IUrsamuSDK) => {
    const sw = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const arg = (u.cmd.args[1] ?? "").trim();

    if (sw === "start") {
      await handleStart(u, arg);
    } else if (sw === "join") {
      await handleJoin(u, arg);
    } else if (sw === "leave") {
      await handleLeave(u);
    } else if (sw === "list") {
      await handleList(u);
    } else if (sw === "log") {
      await handleLog(u, arg);
    } else if (sw === "link") {
      await handleLink(u, arg);
    } else if (sw === "end") {
      await handleEnd(u, arg);
    } else {
      u.send("Invalid +scene switch. See +help +scene.");
    }
  },
});

async function handleStart(u: IUrsamuSDK, arg: string) {
  if (!arg) {
    u.send("Usage: +scene/start [<template_room>=]<title>/<desc>");
    return;
  }

  let templateStr = "";
  let rest = arg;

  const eqIdx = arg.indexOf("=");
  if (eqIdx !== -1) {
    templateStr = arg.slice(0, eqIdx).trim();
    rest = arg.slice(eqIdx + 1).trim();
  }

  const slashIdx = rest.indexOf("/");
  if (slashIdx === -1) {
    u.send("Usage: +scene/start [<template_room>=]<title>/<desc> (missing slash separating title and description)");
    return;
  }

  const title = rest.slice(0, slashIdx).trim();
  const desc = rest.slice(slashIdx + 1).trim();

  if (!title) {
    u.send("Scene must have a title.");
    return;
  }

  let templateRoom: IDBObj = u.here;
  if (templateStr) {
    const found = await u.util.target(u.me, templateStr);
    if (!found || !found.flags.has("room")) {
      u.send(`I cannot find room template: "${templateStr}"`);
      return;
    }
    templateRoom = found;
  }

  // Create instanced room
  const instanced = await u.db.create({
    flags: new Set(["room"]),
    location: "",
    state: {
      name: `Scene: ${title}`,
      description: templateRoom.state.description || "A plain room.",
      sceneId: "", // will set below
    },
    contents: [],
  });

  const activeScenes = await scenes.query({ status: "active" });
  const nextId = String(activeScenes.length + 1);

  // Update room with sceneId
  await u.db.modify(instanced.id, "$set", { "state.sceneId": nextId });

  const newScene: IScene = {
    id: nextId,
    name: title,
    desc,
    owner: u.me.id,
    participants: [u.me.id],
    allowed: [u.me.id],
    private: false,
    status: "active",
    sceneType: "social",
    startTime: Date.now(),
    templateLocation: templateRoom.id,
    instancedRoomId: instanced.id,
    poses: [],
  };

  await scenes.create(newScene);

  // Save pre-scene location
  await u.db.modify(u.me.id, "$set", { "state.preSceneLocation": u.me.location || "" });

  // Teleport creator
  u.teleport(u.me.id, instanced.id);

  u.send(`%cgScene #${nextId} started in instanced room: %ch${title}%cn`);
  
  gameHooks.emit("scene:created", {
    sceneId: nextId,
    sceneName: title,
    roomId: instanced.id,
    actorId: u.me.id,
    actorName: u.util.displayName(u.me, u.me),
    sceneType: "social",
  }).catch(e => console.error("[scene:created] Hook emit failed:", e));
}

async function handleJoin(u: IUrsamuSDK, arg: string) {
  if (!arg) {
    u.send("Usage: +scene/join <scene_id>");
    return;
  }

  const scene = await scenes.queryOne({ id: arg });
  if (!scene || scene.status !== "active") {
    u.send("No active scene found with that ID.");
    return;
  }

  if (scene.private && !scene.allowed.includes(u.me.id) && !isStaff(u)) {
    u.send("This scene is private.");
    return;
  }

  const instancedRoomId = scene.instancedRoomId;
  if (!instancedRoomId) {
    u.send("Instanced room not found for this scene.");
    return;
  }

  // Update participant list
  const participants = [...(scene.participants || [])];
  if (!participants.includes(u.me.id)) {
    participants.push(u.me.id);
    await scenes.modify({ id: scene.id }, "$set", { participants });
  }

  // Save pre-scene location
  await u.db.modify(u.me.id, "$set", { "state.preSceneLocation": u.me.location || "" });

  // Teleport
  u.teleport(u.me.id, instancedRoomId);
  u.send(`%cgYou joined scene: %ch${scene.name}%cn`);
}

async function handleLeave(u: IUrsamuSDK) {
  const preLoc = u.me.state.preSceneLocation as string | undefined;
  const home = u.me.state.home as string | undefined;
  const dest = preLoc || home || "0";

  await u.db.modify(u.me.id, "$unset", { "state.preSceneLocation": "" });
  u.teleport(u.me.id, dest);
  u.send("%cgYou left the scene.%cn");
}

async function handleList(u: IUrsamuSDK) {
  const allActive = await scenes.query({ status: "active" });
  if (allActive.length === 0) {
    u.send("No active scenes right now.");
    return;
  }

  u.send(u.util.center(" Active Scenes ", 78, "="));
  u.send(u.util.ljust("ID", 6) + u.util.ljust("Title", 30) + u.util.ljust("Location Template", 20) + "Creator");
  u.send("-".repeat(78));

  for (const s of allActive) {
    const creatorObj = await dbojs.queryOne({ id: s.owner });
    const creatorName = creatorObj ? u.util.displayName(hydrate(creatorObj), u.me) : s.owner;
    
    const templateObj = await dbojs.queryOne({ id: s.templateLocation });
    const templateName = templateObj ? u.util.displayName(hydrate(templateObj), u.me) : s.templateLocation;

    u.send(
      u.util.ljust(s.id, 6) + 
      u.util.ljust(s.name.slice(0, 28), 30) + 
      u.util.ljust(templateName.slice(0, 18), 20) + 
      creatorName
    );
  }
  u.send("=".repeat(78));
}

async function handleLog(u: IUrsamuSDK, arg: string) {
  if (!arg) {
    u.send("Usage: +scene/log <scene_id>");
    return;
  }

  const scene = await scenes.queryOne({ id: arg });
  if (!scene) {
    u.send("Scene not found.");
    return;
  }

  if (scene.private && !scene.allowed.includes(u.me.id) && !isStaff(u)) {
    u.send("This scene is private.");
    return;
  }

  u.send(u.util.center(` Log for Scene: ${scene.name} `, 78, "="));
  for (const p of scene.poses || []) {
    const speaker = p.moniker || p.charName;
    if (p.type === "ooc") {
      u.send(`[OOC] ${speaker}: ${p.msg}`);
    } else if (p.type === "set") {
      u.send(`[Scene Set] ${p.msg}`);
    } else {
      u.send(`${speaker} ${p.msg}`);
    }
  }
  u.send("=".repeat(78));
}

async function handleLink(u: IUrsamuSDK, arg: string) {
  const eqIdx = arg.indexOf("=");
  if (eqIdx === -1) {
    u.send("Usage: +scene/link <scene_id>=<discord_channel_id>");
    return;
  }

  const sceneId = arg.slice(0, eqIdx).trim();
  const discordId = arg.slice(eqIdx + 1).trim();

  const scene = await scenes.queryOne({ id: sceneId });
  if (!scene) {
    u.send("Scene not found.");
    return;
  }

  if (scene.owner !== u.me.id && !isStaff(u)) {
    u.send("Permission denied. Only the owner can link Discord.");
    return;
  }

  await scenes.modify({ id: scene.id }, "$set", { discordChannelId: discordId });
  u.send(`%cgDiscord channel linked to Scene #${scene.id}.%cn`);
}

async function handleEnd(u: IUrsamuSDK, arg: string) {
  if (!arg) {
    u.send("Usage: +scene/end <scene_id>");
    return;
  }

  const scene = await scenes.queryOne({ id: arg });
  if (!scene || scene.status !== "active") {
    u.send("Active scene not found.");
    return;
  }

  if (scene.owner !== u.me.id && !isStaff(u)) {
    u.send("Permission denied. Only the owner or staff can end the scene.");
    return;
  }

  // End the scene status
  await scenes.modify({ id: scene.id }, "$set", { status: "closed", endTime: Date.now() });

  const instancedRoomId = scene.instancedRoomId;

  // Teleport remaining players back
  if (instancedRoomId) {
    const inside = await dbojs.query({ location: instancedRoomId });
    for (const p of inside) {
      if (p.flags.includes("player")) {
        const preLoc = (p.data?.preSceneLocation as string | undefined) || (p.data?.home as string | undefined) || "0";
        // Teleport player back
        u.teleport(p.id, preLoc);
        u.send(`%crThe scene has ended. Teleporting you back to your previous location.%cn`, p.id);
      }
    }
    
    // Destroy instanced room
    await u.db.destroy(instancedRoomId);
  }

  u.send(`%cgScene #${scene.id} has been closed and the instanced room cleaned up.%cn`);

  // BBS posting integration
  await postSceneToBBS(scene, u);

  gameHooks.emit("scene:clear", {
    sceneId: scene.id,
    sceneName: scene.name,
    actorId: u.me.id,
    actorName: u.util.displayName(u.me, u.me),
    status: "closed",
  }).catch(e => console.error("[scene:clear] Hook emit failed:", e));
}

async function postSceneToBBS(scene: IScene, u: IUrsamuSDK) {
  try {
    const bbsPosts = new DBO<any>("server.bboard_posts");
    const bbsBoards = new DBO<any>("server.bboards");

    // Look for a board named "Scene Logs" or "Scenes" or default to board #1
    const boards = await bbsBoards.query({});
    let targetBoard = boards.find(b => b.title.toLowerCase() === "scene logs" || b.title.toLowerCase() === "scenes");
    if (!targetBoard && boards.length > 0) {
      targetBoard = boards[0];
    }

    if (!targetBoard) return;

    const allPosts = await bbsPosts.query({ boardId: targetBoard.num });
    const nextNum = allPosts.length === 0 ? 1 : Math.max(...allPosts.map(p => p.num)) + 1;

    // Format markdown log
    const lines = [
      `# Scene log: ${scene.name}`,
      `**Description:** ${scene.desc}`,
      `**Started:** ${new Date(scene.startTime).toLocaleString()}`,
      `**Ended:** ${new Date().toLocaleString()}`,
      "",
      "---",
      ""
    ];

    for (const p of scene.poses || []) {
      const speaker = p.moniker || p.charName;
      if (p.type === "ooc") {
        lines.push(`*[OOC] ${speaker}: ${p.msg}*`);
      } else if (p.type === "set") {
        lines.push(`*[Scene Set] ${p.msg}*`);
      } else {
        lines.push(`**${speaker}** ${p.msg}`);
      }
      lines.push("");
    }

    const post = {
      id: crypto.randomUUID(),
      boardId: targetBoard.num,
      num: nextNum,
      subject: scene.name,
      body: lines.join("\n"),
      authorId: scene.owner,
      authorName: u.util.displayName(u.me, u.me),
      createdAt: Date.now(),
      timeout: 0,
      editCount: 0,
      replies: [],
      sticky: false,
      sceneId: scene.id,
      tags: ["scene"],
      flags: [],
      watchers: [],
    };

    await bbsPosts.create(post);
    u.send(`%cgScene log archived to BBS board %ch${targetBoard.title}%cn.`);
  } catch (err) {
    console.error("[scene:bbs] Failed to post log to BBS:", err);
  }
}

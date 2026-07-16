import { gameHooks } from "@ursamu/mush";
import { scenes } from "./db.ts";
import type { IScenePose, IScene } from "./types.ts";

export function subscribeSceneHooks(): void {
  gameHooks.on("player:say", onPlayerSay);
  gameHooks.on("player:pose", onPlayerPose);
}

export function unsubscribeSceneHooks(): void {
  gameHooks.off("player:say", onPlayerSay);
  gameHooks.off("player:pose", onPlayerPose);
}

async function logScenePose(roomId: string, pose: Omit<IScenePose, "id" | "timestamp">) {
  // Find active scene in this room (either instancedRoomId or location matches roomId)
  const activeScenes = await scenes.query({ status: "active" });
  const scene = activeScenes.find(s => s.instancedRoomId === roomId || s.templateLocation === roomId);
  if (!scene) return;

  const newPose: IScenePose = {
    ...pose,
    id: crypto.randomUUID(),
    timestamp: Date.now(),
  };

  const poses = [...(scene.poses || [])];
  poses.push(newPose);

  const participants = [...(scene.participants || [])];
  if (!participants.includes(pose.charId)) {
    participants.push(pose.charId);
  }

  await scenes.modify({ id: scene.id }, "$set", { poses, participants });

  // Emit scene:pose event for external subscribers (e.g. Discord, web)
  gameHooks.emit("scene:pose", {
    sceneId: scene.id,
    sceneName: scene.name,
    roomId,
    actorId: pose.charId,
    actorName: pose.charName,
    msg: pose.msg,
    type: pose.type,
    source: pose.source,
  }).catch(err => console.error("[SceneHooks] Failed to emit scene:pose:", err));
}

function onPlayerSay(e: { actorId: string; actorName: string; roomId: string; message: string }) {
  void logScenePose(e.roomId, {
    charId: e.actorId,
    charName: e.actorName,
    msg: e.message,
    type: "pose", // in scenes, says are logged under poses
    source: "game",
  });
}

function onPlayerPose(e: { actorId: string; actorName: string; roomId: string; content: string }) {
  void logScenePose(e.roomId, {
    charId: e.actorId,
    charName: e.actorName,
    msg: e.content,
    type: "pose",
    source: "game",
  });
}

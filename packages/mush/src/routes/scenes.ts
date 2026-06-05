/**
 * @module routes/scenes
 *
 * Scene management REST endpoints:
 *   GET    /api/v1/scenes/locations   — accessible rooms for scene creation
 *   GET    /api/v1/scenes             — list scenes (private filtered by access)
 *   POST   /api/v1/scenes             — create new scene
 *   GET    /api/v1/scenes/:id         — get scene detail with participant/location info
 *   GET    /api/v1/scenes/:id/export  — export scene as markdown or JSON
 *   POST   /api/v1/scenes/:id/pose    — add a pose / OOC / set description
 *   PATCH  /api/v1/scenes/:id/pose/:poseId  — edit a pose
 *   POST   /api/v1/scenes/:id/join    — join a scene
 *   POST   /api/v1/scenes/:id/invite  — invite a player to a private scene
 *   PATCH  /api/v1/scenes/:id         — update scene metadata / status
 */

import { dbojs, scenes, Obj, evaluateLock, hydrate, gameHooks } from "@ursamu/mush";
import { send } from "@ursamu/core";

// ── helpers ───────────────────────────────────────────────────────────────────

const hasFlag = (flagStr: string, ...names: string[]): boolean => {
  const set = new Set(flagStr.split(/\s+/));
  return names.some((n) => set.has(n));
};

const canAccessScene = (
  scene: { owner?: string; participants?: string[]; allowed?: string[] },
  user:  { dbref: string; flags: string },
): boolean =>
  scene.owner === user.dbref ||
  (scene.participants?.includes(user.dbref) ?? false) ||
  (scene.allowed?.includes(user.dbref) ?? false) ||
  hasFlag(user.flags, "wizard", "admin", "superuser");

// ── main handler ──────────────────────────────────────────────────────────────

export async function sceneHandler(req: Request, userId: string): Promise<Response> {
  const url  = new URL(req.url);
  const path = url.pathname;

  // GET /api/v1/scenes/locations
  if (path === "/api/v1/scenes/locations" && req.method === "GET") {
    const user = await Obj.get(userId);
    if (!user) return new Response("Unauthorized", { status: 401 });

    const allObjects = await dbojs.query({});
    const rooms      = allObjects.filter((o) => hasFlag(o.flags, "room"));

    const accessibleRooms: { id: string; name: string; type: "public" | "private" }[] = [];

    for (const room of rooms) {
      const locks = room.data?.locks as Record<string, string> | undefined;
      const lock  = locks?.enter;
      let canEnter = true;

      if (hasFlag(user.flags, "wizard", "admin", "superuser") || user.dbref === "#1") {
        canEnter = true;
      } else {
        try {
          canEnter = await evaluateLock(lock || "", hydrate(user.dbobj), hydrate(room));
        } catch (e: unknown) {
          console.error(`[Locations] Error evaluating lock for room ${room.id}:`, e);
          canEnter = false;
        }
      }

      if (canEnter) {
        accessibleRooms.push({
          id:   room.id,
          name: room.data?.name || "Unnamed Room",
          type: lock ? "private" : "public",
        });
      }
    }

    accessibleRooms.sort((a, b) => a.name.localeCompare(b.name));
    return new Response(JSON.stringify(accessibleRooms), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // GET /api/v1/scenes
  if (path === "/api/v1/scenes" && req.method === "GET") {
    const user        = await Obj.get(userId);
    const activeScenes = await scenes.find({});

    const visibleScenes = activeScenes.filter((scene) => {
      const s = scene as Record<string, unknown>;
      if (!s.private) return true;
      if (!user) return false;
      if (hasFlag(user.flags, "wizard", "admin", "superuser")) return true;
      return s.owner === user.dbref ||
        (Array.isArray(s.participants) && s.participants.includes(user.dbref)) ||
        (Array.isArray(s.allowed)      && s.allowed.includes(user.dbref));
    });

    visibleScenes.sort((a, b) =>
      ((b as Record<string, unknown>).startTime as number) -
      ((a as Record<string, unknown>).startTime as number)
    );

    return new Response(JSON.stringify(visibleScenes), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // POST /api/v1/scenes
  if (path === "/api/v1/scenes" && req.method === "POST") {
    const body = await req.json();
    const { name, location, desc, private: isPrivate, sceneType } = body;

    if (!name || !location) return new Response("Missing name or location", { status: 400 });
    if (typeof name !== "string" || !name.trim() || name.length > 200) {
      return new Response("Scene name must be between 1 and 200 characters.", { status: 400 });
    }
    if (desc !== undefined && (typeof desc !== "string" || desc.length > 2000)) {
      return new Response("Scene description must be 2000 characters or fewer.", { status: 400 });
    }

    const user = await Obj.get(userId);
    if (!user) return new Response("Unauthorized", { status: 401 });

    const { counters } = await import("@ursamu/mush");
    const counter = await counters.queryOne({ id: "sceneid" });
    const id      = String((counter?.value ?? 0) + 1);
    await counters.modify({ id: "sceneid" }, "$set", { id: "sceneid", value: parseInt(id, 10) });

    const newScene = {
      id:          id.toString(),
      name,
      location,
      desc,
      owner:        user.dbref,
      participants: [user.dbref],
      allowed:      [user.dbref],
      private:      !!isPrivate,
      poses:        [],
      startTime:    Date.now(),
      status:       "active",
      sceneType:    sceneType || "social",
    };

    await scenes.create(newScene as Parameters<typeof scenes.create>[0]);

    gameHooks.emit("scene:created", {
      sceneId:   newScene.id,
      sceneName: newScene.name,
      roomId:    newScene.location,
      actorId:   user.dbref,
      actorName: user.name || "Unknown",
      sceneType: newScene.sceneType,
    }).catch((e: unknown) => console.error("[GameHooks] scene:created error:", e));

    return new Response(JSON.stringify(newScene), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Sub-resource routes: /api/v1/scenes/:id[/...]
  const match = path.match(/\/api\/v1\/scenes\/([^/]+)(.*)/);
  if (!match) return new Response("Not Found", { status: 404 });

  const sceneId = match[1];
  const subPath = match[2];

  const scene = await scenes.queryOne({ id: sceneId });
  if (!scene) return new Response("Scene Not Found", { status: 404 });

  const s = scene as Record<string, unknown>;

  // GET /api/v1/scenes/:id
  if (!subPath && req.method === "GET") {
    if (s.private) {
      const viewer = await Obj.get(userId);
      if (!viewer || !canAccessScene(scene as Parameters<typeof canAccessScene>[0], viewer)) {
        return new Response("Forbidden", { status: 403 });
      }
    }

    const participantsDetails: { id: string; name: string; moniker?: string }[] = [];
    for (const pId of (s.participants as string[] | undefined) ?? []) {
      const pObj = await Obj.get(pId);
      if (pObj) {
        participantsDetails.push({
          id:      pObj.dbref,
          name:    pObj.name || "Unknown",
          moniker: pObj.data?.moniker as string | undefined,
        });
      }
    }
    (scene as Record<string, unknown>).participantsDetails = participantsDetails;

    let locId = (s.location as string) || "";
    if (locId && !locId.startsWith("#") && !isNaN(Number(locId))) locId = `#${locId}`;
    if (locId) {
      const locObj = await Obj.get(locId);
      if (locObj) {
        (scene as Record<string, unknown>).locationDetails = {
          name: locObj.name || "Unknown Location",
          id:   locObj.dbref,
        };
      }
    }

    return new Response(JSON.stringify(scene), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // GET /api/v1/scenes/:id/export
  if (subPath === "/export" && req.method === "GET") {
    const format = url.searchParams.get("format") || "markdown";

    if (format === "json") {
      return new Response(JSON.stringify(scene, null, 2), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // deno-lint-ignore no-control-regex
    const strip   = (str: string) => str.replace(/%c[a-zA-Z]/g, "").replace(/%[nrtbR]/g, "").replace(/\x1b\[[0-9;]*m/g, "");
    const fmtDate = (ts: number) => new Date(ts).toISOString().slice(0, 10);

    const locName         = (s.locationDetails as Record<string, unknown>)?.name as string ?? s.location as string;
    const participantDets = s.participantsDetails as Record<string, unknown>[] | undefined;
    const participantNames = participantDets
      ? participantDets.map((p) => strip((p.moniker || p.name) as string)).join(", ")
      : (s.participants as string[]).join(", ");

    const lines: string[] = [
      `# ${strip(s.name as string)}`,
      ``,
      `**Type:** ${s.sceneType ?? "social"} | **Status:** ${s.status}  `,
      `**Location:** ${strip(locName)}  `,
      `**Started:** ${fmtDate(s.startTime as number)}${s.endTime ? `  \n**Ended:** ${fmtDate(s.endTime as number)}` : ""}  `,
      `**Participants:** ${participantNames}`,
      ``,
      `---`,
      ``,
    ];

    for (const pose of (s.poses as Record<string, unknown>[]) ?? []) {
      const speaker = strip((pose.moniker || pose.charName) as string);
      if (pose.type === "ooc") {
        lines.push(`*[OOC] ${speaker}: ${pose.msg}*`);
      } else if (pose.type === "set") {
        lines.push(`*[Scene Set] ${pose.msg}*`);
      } else {
        lines.push(`**${speaker}** ${pose.msg}`);
      }
      lines.push(``);
    }

    lines.push(`---`);
    lines.push(`*Exported ${fmtDate(Date.now())}*`);

    return new Response(lines.join("\n"), {
      status: 200,
      headers: { "Content-Type": "text/markdown; charset=utf-8" },
    });
  }

  // POST /api/v1/scenes/:id/pose
  if (subPath === "/pose" && req.method === "POST") {
    const body = await req.json();
    const { msg, type = "pose" } = body;
    const user = await Obj.get(userId);
    if (!user) return new Response("Unauthorized", { status: 401 });

    if (s.private && !canAccessScene(scene as Parameters<typeof canAccessScene>[0], user)) {
      return new Response("Forbidden", { status: 403 });
    }

    if (!msg && type !== "set") return new Response("Missing pose message", { status: 400 });
    if (msg && msg.length > 4000) {
      return new Response("Pose message too long (max 4000 characters).", { status: 400 });
    }

    const newPose = {
      id:        crypto.randomUUID(),
      charId:    user.dbref,
      charName:  user.name || "Unknown",
      moniker:   user.data?.moniker as string | undefined,
      avatar:    user.data?.image as string | undefined,
      msg:       msg || "",
      type:      type as "pose" | "ooc" | "set",
      timestamp: Date.now(),
    };

    const poses        = (s.poses        as Record<string, unknown>[]) ?? [];
    const participants = (s.participants as string[]) ?? [];

    poses.push(newPose);
    if (!participants.includes(user.dbref)) participants.push(user.dbref);

    await scenes.modify({ id: sceneId }, "$set", { poses, participants });

    let target = s.location as string;
    if (!target.startsWith("#") && !isNaN(Number(target))) target = `#${target}`;

    if (target.startsWith("#")) {
      let broadcastMsg = "";
      const userName = user.name || "Unknown";
      if (type === "ooc")       broadcastMsg = `%ch[OOC] ${userName}:%cn ${msg}`;
      else if (type === "set")  broadcastMsg = `%ch%cy[Scene Set]%cn ${msg}`;
      else                      broadcastMsg = `%ch${userName}%cn ${msg}`;
      send([target], broadcastMsg, {});
    }

    const posePayload = {
      sceneId,
      sceneName: s.name as string,
      roomId:    s.location as string,
      actorId:   user.dbref,
      actorName: user.name || "Unknown",
      msg:       msg || "",
      type:      type as "pose" | "ooc" | "set",
    };
    gameHooks.emit("scene:pose", posePayload)
      .catch((e: unknown) => console.error("[GameHooks] scene:pose error:", e));

    if (type === "set") {
      gameHooks.emit("scene:set", {
        sceneId,
        sceneName:   s.name as string,
        roomId:      s.location as string,
        actorId:     user.dbref,
        actorName:   user.name || "Unknown",
        description: msg || "",
      }).catch((e: unknown) => console.error("[GameHooks] scene:set error:", e));
    }

    return new Response(JSON.stringify(newPose), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  }

  // PATCH /api/v1/scenes/:id/pose/:poseId
  const poseMatch = subPath?.match(/\/pose\/([^/]+)/);
  if (poseMatch && req.method === "PATCH") {
    const poseId = poseMatch[1];
    const user   = await Obj.get(userId);
    if (!user) return new Response("Unauthorized", { status: 401 });

    const poses = (s.poses as Record<string, unknown>[]) ?? [];
    const poseIndex = poses.findIndex((p) => p.id === poseId);
    if (poseIndex === -1) return new Response("Pose Not Found", { status: 404 });

    const existingPose = poses[poseIndex];
    if (existingPose.charId !== user.dbref && s.owner !== user.dbref) {
      return new Response("Forbidden", { status: 403 });
    }

    const body = await req.json();
    if (body.msg) {
      if (body.msg.length > 4000) return new Response("Pose message too long (max 4000 characters).", { status: 400 });
      existingPose.msg = body.msg;
    }

    poses[poseIndex] = existingPose;
    await scenes.modify({ id: sceneId }, "$set", { poses });
    return new Response(JSON.stringify(existingPose), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // POST /api/v1/scenes/:id/join
  if (subPath === "/join" && req.method === "POST") {
    const user = await Obj.get(userId);
    if (!user) return new Response("Unauthorized", { status: 401 });

    if (s.private && !canAccessScene(scene as Parameters<typeof canAccessScene>[0], user)) {
      return new Response("This scene is private.", { status: 403 });
    }

    const participants = (s.participants as string[]) ?? [];
    if (!participants.includes(user.dbref)) {
      participants.push(user.dbref);
      const allowed = (s.allowed as string[] | undefined) ?? [];
      if (s.private && !allowed.includes(user.dbref)) {
        allowed.push(user.dbref);
        await scenes.modify({ id: sceneId }, "$set", { allowed });
      }
      await scenes.modify({ id: sceneId }, "$set", { participants });
    }

    return new Response(JSON.stringify({ success: true, scene }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // POST /api/v1/scenes/:id/invite
  if (subPath === "/invite" && req.method === "POST") {
    const user = await Obj.get(userId);
    if (!user) return new Response("Unauthorized", { status: 401 });

    const allowed = (s.allowed as string[] | undefined) ?? [];
    const canInvite = s.owner === user.dbref ||
      allowed.includes(user.dbref) ||
      hasFlag(user.flags, "wizard", "admin", "superuser");
    if (!canInvite) return new Response("Only the owner or co-authors can invite.", { status: 403 });

    const body = await req.json();
    const { target } = body;
    if (!target) return new Response("Missing target", { status: 400 });

    let targetObj = await Obj.get(target);
    if (!targetObj) {
      const all   = await dbojs.query({ "data.name": new RegExp(`^${target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") });
      const found = all.find((o) => hasFlag(o.flags, "player", "connected"));
      if (found) targetObj = await Obj.get(found.id);
    }

    if (!targetObj) return new Response("Target user not found", { status: 404 });

    if (!allowed.includes(targetObj.dbref)) {
      allowed.push(targetObj.dbref);
      await scenes.modify({ id: sceneId }, "$set", { allowed });
    }

    return new Response(JSON.stringify({ success: true, allowed }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // PATCH /api/v1/scenes/:id
  if (!subPath && req.method === "PATCH") {
    const updates = await req.json();
    const user    = await Obj.get(userId);
    if (!user) return new Response("Unauthorized", { status: 401 });

    const isAdmin = hasFlag(user.flags, "wizard", "admin", "superuser");
    if (s.owner && s.owner !== user.dbref) {
      if (!isAdmin) return new Response("Forbidden: Only scene owner can modify scene.", { status: 403 });
    } else if (!s.owner) {
      if (!isAdmin) return new Response("Forbidden: Only staff can claim ownerless scenes.", { status: 403 });
      (scene as Record<string, unknown>).owner = user.dbref;
      await scenes.modify({ id: sceneId }, "$set", { owner: user.dbref });
    }

    const VALID_STATUSES    = new Set(["active", "paused", "closed"]);
    const VALID_SCENE_TYPES = new Set(["social", "event", "vignette", "plot", "training", "other"]);
    const allowedUpdates: Record<string, unknown> = {};

    if (updates.status !== undefined) {
      if (!VALID_STATUSES.has(updates.status)) return new Response("Invalid status value.", { status: 400 });
      allowedUpdates.status = updates.status;
    }
    if (updates.name !== undefined) {
      if (typeof updates.name !== "string" || !updates.name.trim() || updates.name.length > 200) {
        return new Response("Scene name must be between 1 and 200 characters.", { status: 400 });
      }
      allowedUpdates.name = updates.name;
    }
    if (updates.desc !== undefined) {
      if (typeof updates.desc !== "string" || updates.desc.length > 2000) {
        return new Response("Scene description must be 2000 characters or fewer.", { status: 400 });
      }
      allowedUpdates.desc = updates.desc;
    }
    if (updates.endTime)    allowedUpdates.endTime   = updates.endTime;
    if (updates.sceneType !== undefined) {
      if (!VALID_SCENE_TYPES.has(updates.sceneType)) return new Response("Invalid sceneType value.", { status: 400 });
      allowedUpdates.sceneType = updates.sceneType;
    }

    if (Object.keys(allowedUpdates).length === 0) return new Response("No valid updates", { status: 400 });

    await scenes.modify({ id: sceneId }, "$set", allowedUpdates);
    const updated = await scenes.queryOne({ id: sceneId });

    if (allowedUpdates.name && allowedUpdates.name !== s.name) {
      gameHooks.emit("scene:title", {
        sceneId,
        oldName:   s.name as string,
        newName:   allowedUpdates.name as string,
        actorId:   user.dbref,
        actorName: user.name || "Unknown",
      }).catch((e: unknown) => console.error("[GameHooks] scene:title error:", e));
    }

    if (allowedUpdates.status && allowedUpdates.status !== s.status) {
      const closedStatuses = ["closed", "finished", "archived"];
      if (closedStatuses.includes(allowedUpdates.status as string)) {
        gameHooks.emit("scene:clear", {
          sceneId,
          sceneName: (allowedUpdates.name ?? s.name) as string,
          actorId:   user.dbref,
          actorName: user.name || "Unknown",
          status:    allowedUpdates.status as string,
        }).catch((e: unknown) => console.error("[GameHooks] scene:clear error:", e));
      }
    }

    return new Response(JSON.stringify(updated), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response("Not Found", { status: 404 });
}

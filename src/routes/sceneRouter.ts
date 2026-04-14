import { scenes, dbojs } from "../services/Database/index.ts";
import { getNextId } from "../utils/getNextId.ts";
import { Obj } from "../services/DBObjs/DBObjs.ts";
import type { IScene, IPose } from "../@types/IScene.ts";
import { send } from "../services/broadcast/index.ts";
import { evaluateLock, hydrate } from "../utils/evaluateLock.ts";
import { gameHooks } from "../services/Hooks/GameHooks.ts";

const hasFlag = (flags: string, ...names: string[]): boolean => {
  const set = new Set(flags.split(/\s+/));
  return names.some(n => set.has(n));
};

/** Returns true if `user` is permitted to view or interact with `scene`. */
const canAccessScene = (
  scene: { owner?: string; participants?: string[]; allowed?: string[] },
  user:  { dbref: string; flags: string },
): boolean =>
  scene.owner === user.dbref ||
  (scene.participants?.includes(user.dbref) ?? false) ||
  (scene.allowed?.includes(user.dbref) ?? false) ||
  hasFlag(user.flags, "wizard", "admin", "superuser");

export const sceneHandler = async (req: Request, userId: string): Promise<Response> => {
  const url = new URL(req.url);
  const path = url.pathname;
  
  // Format: /api/v1/scenes or /api/v1/scenes/:id or /api/v1/scenes/:id/pose
  
  // GET /api/v1/scenes/locations - List accessible rooms
  if (path === "/api/v1/scenes/locations" && req.method === "GET") {
      const user = await Obj.get(userId);
      if (!user) return new Response("Unauthorized", { status: 401 });

      // Fetch all rooms - broadening query to debug
      // Regex query might be failing?
      const allObjects = await dbojs.query({});
      const rooms = allObjects.filter(o => hasFlag(o.flags, "room"));
      
      
      const accessibleRooms: {id: string, name: string, type: "public" | "private"}[] = [];

      for (const room of rooms) {
          // Check Enter Lock
          const locks = room.data?.locks as Record<string, string> | undefined;
          const lock = locks?.enter;
          
          let canEnter = true;

          // Admin Bypass
          if (hasFlag(user.flags, "wizard", "admin", "superuser") || user.dbref === "#1") {
              canEnter = true;
          } else {
              try {
                 if (typeof evaluateLock === 'function') {
                     canEnter = await evaluateLock(lock || "", hydrate(user.dbobj), hydrate(room));
                 } else {
                     canEnter = true; 
                 }
              } catch (e) {
                 console.error(`[Locations] Error evaluating lock for room ${room.id}:`, e);
                 canEnter = false; // Fail closed on lock evaluation error
              }
          }
          
          if (canEnter) {
              accessibleRooms.push({
                  id: room.id,
                  name: room.data?.name || "Unnamed Room",
                  type: lock ? "private" : "public"
              });
          }
      }

      // Sort alpha
      accessibleRooms.sort((a, b) => a.name.localeCompare(b.name));

      return new Response(JSON.stringify(accessibleRooms), {
          status: 200,
          headers: { "Content-Type": "application/json" }
      });
  }

  // GET /api/v1/scenes - List all active scenes (or filtered)
  if (path === "/api/v1/scenes" && req.method === "GET") {
      const user = await Obj.get(userId);
      const activeScenes = await scenes.find({}); 
      
      // Filter private scenes
      const visibleScenes = activeScenes.filter(scene => {
          if (!scene.private) return true;
          if (!user) return false;
          // Admins/wizards can see all scenes
          if (hasFlag(user.flags, "wizard", "admin", "superuser")) return true;
          // Visible if owner, participant, or allowed
          return scene.owner === user.dbref ||
                 (scene.participants && scene.participants.includes(user.dbref)) ||
                 (scene.allowed && scene.allowed.includes(user.dbref));
      });

      // Sort by start time desc?
      visibleScenes.sort((a, b) => b.startTime - a.startTime);
      
      return new Response(JSON.stringify(visibleScenes), {
          status: 200,
          headers: { "Content-Type": "application/json" }
      });
  }

  // POST /api/v1/scenes - Create new scene
  if (path === "/api/v1/scenes" && req.method === "POST") {
      const body = await req.json();
      const { name, location, desc, private: isPrivate, sceneType } = body;

      if (!name || !location) {
          return new Response("Missing name or location", { status: 400 });
      }
      if (typeof name !== "string" || !name.trim() || name.length > 200) {
          return new Response("Scene name must be between 1 and 200 characters.", { status: 400 });
      }
      if (desc !== undefined && (typeof desc !== "string" || desc.length > 2000)) {
          return new Response("Scene description must be 2000 characters or fewer.", { status: 400 });
      }

      const id = await getNextId("sceneid");
      const user = await Obj.get(userId);
      
      if (!user) return new Response("Unauthorized", { status: 401 });

      const newScene: IScene = {
          id: id.toString(),
          name,
          location, // Start in current location of user?
          desc,
          owner: user.dbref,
          participants: [user.dbref],
          allowed: [user.dbref],
          private: !!isPrivate,
          poses: [],
          startTime: Date.now(),
          status: "active",
          sceneType: sceneType || "social"
      };

      await scenes.create(newScene);

      gameHooks.emit("scene:created", {
          sceneId:   newScene.id,
          sceneName: newScene.name,
          roomId:    newScene.location,
          actorId:   user.dbref,
          actorName: user.name || "Unknown",
          sceneType: newScene.sceneType ?? "social",
      }).catch((e) => console.error("[GameHooks] scene:created error:", e));

      return new Response(JSON.stringify(newScene), {
          status: 201,
          headers: { "Content-Type": "application/json" }
      });
  }

  const match = path.match(/\/api\/v1\/scenes\/([^\/]+)(.*)/);
  if (match) {
      const sceneId = match[1];
      const subPath = match[2];

      const scene = await scenes.queryOne({ id: sceneId });
      if (!scene) return new Response("Scene Not Found", { status: 404 });

      // GET /api/v1/scenes/:id
      if (!subPath && req.method === "GET") {
          // Private scenes are only visible to owner, participants, and allowed users
          if (scene.private) {
              const viewer = await Obj.get(userId);
              if (!viewer || !canAccessScene(scene, viewer)) {
                return new Response("Forbidden", { status: 403 });
              }
          }

          // Populate participant names
          const participantsDetails: { id: string; name: string; moniker?: string; }[] = [];
          if (scene.participants) {
              for (const pId of scene.participants) {
                  const pObj = await Obj.get(pId);
                  if (pObj) {
                      participantsDetails.push({ 
                          id: pObj.dbref, 
                          name: pObj.name || "Unknown",
                          moniker: pObj.data?.moniker as string | undefined 
                      });
                  }
              }
          }
          scene.participantsDetails = participantsDetails;

          // Populate location details
          if (scene.location) {
              let locId = scene.location;
               if (!locId.startsWith("#") && !isNaN(Number(locId))) {
                  locId = `#${locId}`;
              }
              const locObj = await Obj.get(locId);
              if (locObj) {
                  scene.locationDetails = {
                      name: locObj.name || "Unknown Location",
                      id: locObj.dbref
                  };
              }
          }

          return new Response(JSON.stringify(scene), {
              status: 200,
              headers: { "Content-Type": "application/json" }
          });
      }

      // GET /api/v1/scenes/:id/export?format=markdown|json
      if (subPath === "/export" && req.method === "GET") {
          const format = url.searchParams.get("format") || "markdown";

          if (format === "json") {
              return new Response(JSON.stringify(scene, null, 2), {
                  status: 200,
                  headers: { "Content-Type": "application/json" }
              });
          }

          // Markdown log export
          // deno-lint-ignore no-control-regex
          const strip = (s: string) => s.replace(/%c[a-zA-Z]/g, "").replace(/%[nrtbR]/g, "").replace(/\x1b\[[0-9;]*m/g, "");
          const fmtDate = (ts: number) => new Date(ts).toISOString().slice(0, 10);

          const locName = scene.locationDetails?.name ?? scene.location;
          const participantNames = scene.participantsDetails?.map(p => strip(p.moniker || p.name)).join(", ")
              ?? scene.participants.join(", ");

          const lines: string[] = [
              `# ${strip(scene.name)}`,
              ``,
              `**Type:** ${scene.sceneType ?? "social"} | **Status:** ${scene.status}  `,
              `**Location:** ${strip(locName)}  `,
              `**Started:** ${fmtDate(scene.startTime)}${scene.endTime ? `  \n**Ended:** ${fmtDate(scene.endTime)}` : ""}  `,
              `**Participants:** ${participantNames}`,
              ``,
              `---`,
              ``
          ];

          for (const pose of scene.poses) {
              const speaker = strip(pose.moniker || pose.charName);
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
              headers: { "Content-Type": "text/markdown; charset=utf-8" }
          });
      }

      // POST /api/v1/scenes/:id/pose
      // Handles 'pose', 'ooc', 'set' types
      if (subPath === "/pose" && req.method === "POST") {
          const body = await req.json();
          const { msg, type = "pose" } = body;
          const user = await Obj.get(userId);
          
          if (!user) return new Response("Unauthorized", { status: 401 });

          // Private scene: only allowed users may post
          if (scene.private && !canAccessScene(scene, user)) {
              return new Response("Forbidden", { status: 403 });
          }

          // Basic validation
          if (!msg && type !== 'set') {
            return new Response("Missing pose message", { status: 400 });
          }

          const MAX_POSE_LENGTH = 4000;
          if (msg && msg.length > MAX_POSE_LENGTH) {
            return new Response(`Pose message too long (max ${MAX_POSE_LENGTH} characters).`, { status: 400 });
          }

          const newPose: IPose = {
              id: crypto.randomUUID(),
              charId: user.dbref,
              charName: user.name || "Unknown",
              moniker: user.data?.moniker as string | undefined,
              avatar: user.data?.image as string | undefined, // standardizing on data.image for avatars
              msg: msg || "",
              type: type as IPose["type"],
              timestamp: Date.now()
          };

          // Add pose to scene
          if (!scene.poses) scene.poses = [];
          if (!scene.participants) scene.participants = [];
          scene.poses.push(newPose);
          // Add participant if not already there
          if (!scene.participants.includes(user.dbref)) {
              scene.participants.push(user.dbref);
          }

          // Update DB
          await scenes.modify({ id: sceneId }, "$set", { 
              poses: scene.poses, 
              participants: scene.participants 
          });

          // Broadcast to Grid Room if location is valid
          // If location is just "123", convert to "#123". If "#123", keep it.
          // If "The Void", send() will likely fail or just do nothing, which is fine.
          let target = scene.location;
          if (!target.startsWith("#") && !isNaN(Number(target))) {
              target = `#${target}`;
          }

          if (target.startsWith("#")) {
              let broadcastMsg = "";
              const userName = user.name || "Unknown";

              if (type === "ooc") {
                  broadcastMsg = `%ch[OOC] ${userName}:%cn ${msg}`;
              } else if (type === "set") {
                  broadcastMsg = `%ch%cy[Scene Set]%cn ${msg}`;
              } else {
                  // Pose
                  broadcastMsg = `%ch${userName}%cn ${msg}`;
              }

              send([target], broadcastMsg, {});
          }

          // Fire scene:pose for every pose type, plus scene:set for set descriptions.
          const posePayload = {
              sceneId:   sceneId,
              sceneName: scene.name,
              roomId:    scene.location,
              actorId:   user.dbref,
              actorName: user.name || "Unknown",
              msg:       msg || "",
              type:      type as "pose" | "ooc" | "set",
          };
          gameHooks.emit("scene:pose", posePayload)
              .catch((e) => console.error("[GameHooks] scene:pose error:", e));
          if (type === "set") {
              gameHooks.emit("scene:set", {
                  sceneId:     sceneId,
                  sceneName:   scene.name,
                  roomId:      scene.location,
                  actorId:     user.dbref,
                  actorName:   user.name || "Unknown",
                  description: msg || "",
              }).catch((e) => console.error("[GameHooks] scene:set error:", e));
          }

          return new Response(JSON.stringify(newPose), {
              status: 201,
              headers: { "Content-Type": "application/json" }
          });
      }

      // PATCH /api/v1/scenes/:id/pose/:poseId (Edit Pose)
      const poseMatch = subPath?.match(/\/pose\/([^\/]+)/);
      if (poseMatch && req.method === "PATCH") {
          const poseId = poseMatch[1];
          const user = await Obj.get(userId);
          if (!user) return new Response("Unauthorized", { status: 401 });
          
          const poseIndex = scene.poses.findIndex(p => p.id === poseId);
          if (poseIndex === -1) return new Response("Pose Not Found", { status: 404 });

          const existingPose = scene.poses[poseIndex];
          
          // Verify ownership (or admin/scene owner?)
          if (existingPose.charId !== user.dbref && scene.owner !== user.dbref) {
              return new Response("Forbidden", { status: 403 });
          }

          const body = await req.json();
          if (body.msg) {
              if (body.msg.length > 4000) return new Response("Pose message too long (max 4000 characters).", { status: 400 });
              existingPose.msg = body.msg;
          }
          // Don't allow changing type/timestamp broadly?

          scene.poses[poseIndex] = existingPose;
          
          await scenes.modify({ id: sceneId }, "$set", { poses: scene.poses });
          return new Response(JSON.stringify(existingPose), { status: 200, headers: { "Content-Type": "application/json" }});
      }

      // POST /api/v1/scenes/:id/join
      if (subPath === "/join" && req.method === "POST") {
          const user = await Obj.get(userId);
          if (!user) return new Response("Unauthorized", { status: 401 });

          // Check privacy
          if (scene.private && !canAccessScene(scene, user)) {
              return new Response("This scene is private.", { status: 403 });
          }

          if (!scene.participants.includes(user.dbref)) {
              scene.participants.push(user.dbref);
              // Ensure they are in allowed if they joined (implicit allow)
              if (scene.private && scene.allowed && !scene.allowed.includes(user.dbref)) {
                  scene.allowed.push(user.dbref);
                  await scenes.modify({ id: sceneId }, "$set", { allowed: scene.allowed });
              }
              await scenes.modify({ id: sceneId }, "$set", { participants: scene.participants });
          }

          return new Response(JSON.stringify({ success: true, scene }), {
              status: 200,
              headers: { "Content-Type": "application/json" }
          });
      }

      // POST /api/v1/scenes/:id/invite
      if (subPath === "/invite" && req.method === "POST") {
          const user = await Obj.get(userId);
          if (!user) return new Response("Unauthorized", { status: 401 });

          const canInvite = scene.owner === user.dbref ||
              (Array.isArray(scene.allowed) && scene.allowed.includes(user.dbref)) ||
              hasFlag(user.flags, "wizard", "admin", "superuser");
          if (!canInvite) {
               return new Response("Only the owner or co-authors can invite.", { status: 403 });
          }

          const body = await req.json();
          const { target } = body; // target can be dbref or name

          if (!target) return new Response("Missing target", { status: 400 });

          // Resolve target
          let targetObj = await Obj.get(target);
          if (!targetObj) {
               // Try name search
               const all = await dbojs.query({ "data.name": new RegExp(`^${target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, "i") });
               const found = all.find(o => hasFlag(o.flags, "player", "connected"));
               if (found) targetObj = await Obj.get(found.id);
          }

          if (!targetObj) return new Response("Target user not found", { status: 404 });

          if (!scene.allowed) scene.allowed = [scene.owner];
          
          if (!scene.allowed.includes(targetObj.dbref)) {
              scene.allowed.push(targetObj.dbref);
              await scenes.modify({ id: sceneId }, "$set", { allowed: scene.allowed });
          }

          return new Response(JSON.stringify({ success: true, allowed: scene.allowed }), {
               status: 200,
               headers: { "Content-Type": "application/json" }
          });
      }
      
      // PATCH /api/v1/scenes/:id (Update status/meta)
      if (!subPath && req.method === "PATCH") {
           const updates = await req.json();
           
           // Verify Owner for status changes/meta
           const user = await Obj.get(userId);
           if (!user) return new Response("Unauthorized", { status: 401 });
           
           const isAdmin = hasFlag(user.flags, "wizard", "admin", "superuser");
           if (scene.owner && scene.owner !== user.dbref) {
               if (!isAdmin) {
                   return new Response("Forbidden: Only scene owner can modify scene.", { status: 403 });
               }
           } else if (!scene.owner) {
               // Only staff can adopt ownerless (legacy) scenes
               if (!isAdmin) {
                   return new Response("Forbidden: Only staff can claim ownerless scenes.", { status: 403 });
               }
               scene.owner = user.dbref;
               await scenes.modify({ id: sceneId }, "$set", { owner: scene.owner });
           }

           // White list updates
           const VALID_STATUSES = new Set(["active", "paused", "closed"]);
           const VALID_SCENE_TYPES = new Set(["social", "event", "vignette", "plot", "training", "other"]);
           const allowedUpdates: Partial<IScene> = {};
           if (updates.status !== undefined) {
               if (!VALID_STATUSES.has(updates.status)) {
                   return new Response("Invalid status value.", { status: 400 });
               }
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
           if (updates.endTime) allowedUpdates.endTime = updates.endTime;
           if (updates.sceneType !== undefined) {
               if (!VALID_SCENE_TYPES.has(updates.sceneType)) {
                   return new Response("Invalid sceneType value.", { status: 400 });
               }
               allowedUpdates.sceneType = updates.sceneType;
           }

           if (Object.keys(allowedUpdates).length > 0) {
                await scenes.modify({ id: sceneId }, "$set", allowedUpdates);
                const updated = await scenes.queryOne({ id: sceneId });

                // scene:title — name changed
                if (allowedUpdates.name && allowedUpdates.name !== scene.name) {
                    gameHooks.emit("scene:title", {
                        sceneId:   sceneId,
                        oldName:   scene.name,
                        newName:   allowedUpdates.name,
                        actorId:   user.dbref,
                        actorName: user.name || "Unknown",
                    }).catch((e) => console.error("[GameHooks] scene:title error:", e));
                }

                // scene:clear — scene closed or finished
                if (allowedUpdates.status && allowedUpdates.status !== scene.status) {
                    const closedStatuses = ["closed", "finished", "archived"];
                    if (closedStatuses.includes(allowedUpdates.status)) {
                        gameHooks.emit("scene:clear", {
                            sceneId:   sceneId,
                            sceneName: allowedUpdates.name ?? scene.name,
                            actorId:   user.dbref,
                            actorName: user.name || "Unknown",
                            status:    allowedUpdates.status,
                        }).catch((e) => console.error("[GameHooks] scene:clear error:", e));
                    }
                }

                return new Response(JSON.stringify(updated), {
                     status: 200,
                     headers: { "Content-Type": "application/json" }
                });
           }
           return new Response("No valid updates", { status: 400 });
      }
  }

  return new Response("Not Found", { status: 404 });
};

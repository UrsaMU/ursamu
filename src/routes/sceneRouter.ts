import { scenes, dbojs } from "../services/Database/index.ts";
import { getNextId } from "../utils/getNextId.ts";
import { Obj } from "../services/DBObjs/DBObjs.ts";
import type { IScene, IPose } from "../@types/IScene.ts";
import { send } from "../services/broadcast/index.ts";
import { evaluateLock, hydrate } from "../utils/evaluateLock.ts";

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
      const rooms = allObjects.filter(o => o.flags.includes("room"));
      
      console.log(`[Locations Debug] Found ${rooms.length} rooms (filtered from ${allObjects.length} total objects).`);
      
      const accessibleRooms: {id: string, name: string, type: "public" | "private"}[] = [];

      for (const room of rooms) {
          // Check Enter Lock
          const locks = room.data?.locks as Record<string, string> | undefined;
          const lock = locks?.enter;
          
          let canEnter = true;

          // Admin Bypass
          if (user.flags.includes("wizard") || user.flags.includes("admin") || user.flags.includes("superuser") || user.dbref === "#1") {
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
                 canEnter = true; // Fail open for now
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

      // POST /api/v1/scenes/:id/pose
      // Handles 'pose', 'ooc', 'set' types
      if (subPath === "/pose" && req.method === "POST") {
          const body = await req.json();
          const { msg, type = "pose" } = body;
          const user = await Obj.get(userId);
          
          if (!user) return new Response("Unauthorized", { status: 401 });

          // Basic validation
          if (!msg && type !== 'set') { 
                // handle logic
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
          if (body.msg) existingPose.msg = body.msg;
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
          if (scene.private) {
              const isAllowed = scene.owner === user.dbref || 
                               (scene.allowed && scene.allowed.includes(user.dbref)) ||
                               (scene.participants && scene.participants.includes(user.dbref));
              
              if (!isAllowed) return new Response("This scene is private.", { status: 403 });
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

          // Only owner or allowed can invite? Let's say Owner for now.
          if (scene.owner !== user.dbref) {
               return new Response("Only the owner can invite.", { status: 403 });
          }

          const body = await req.json();
          const { target } = body; // target can be dbref or name

          if (!target) return new Response("Missing target", { status: 400 });

          // Resolve target
          let targetObj = await Obj.get(target);
          if (!targetObj) {
               // Try name search
               const all = await dbojs.query({ name: new RegExp(`^${target}$`, "i") });
               const found = all.find(o => o.flags.includes("player") || o.flags.includes("connected")); 
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
           
           // Weak owner check: if scene has owner, must match. If no owner (legacy), allow? Or adopt?
           if (scene.owner && scene.owner !== user.dbref) {
               // Allow admins? For now, strict owner.
               return new Response("Forbidden: Only scene owner can modify scene.", { status: 403 });
           }

           // White list updates
           const allowedUpdates: Partial<IScene> = {};
           if (updates.status) allowedUpdates.status = updates.status;
           if (updates.name) allowedUpdates.name = updates.name;
           if (updates.desc) allowedUpdates.desc = updates.desc;
           if (updates.endTime) allowedUpdates.endTime = updates.endTime;
           if (updates.sceneType) allowedUpdates.sceneType = updates.sceneType;

           if (Object.keys(allowedUpdates).length > 0) {
                await scenes.modify({ id: sceneId }, "$set", allowedUpdates);
                const updated = await scenes.queryOne({ id: sceneId });
                return new Response(JSON.stringify(updated), {
                     status: 200,
                     headers: { "Content-Type": "application/json" }
                });
           }
           return new Response("No valid updates", { status: 400 });
      }
  }
  
  // GET /api/v1/scenes/locations
  // It seems we need to handle this BEFORE the regex match for :id if it's strictly /locations
  // But wait, the previous block matches /api/v1/scenes/:id... 
  // 'locations' matches regex ([^/]+) ? Yes.
  // So /api/v1/scenes/locations matches sceneId="locations".
  // We should move this check UP or handle it specifically.
  // Let's refactor slightly to check exact paths first.

  return new Response("Not Found", { status: 404 });
};

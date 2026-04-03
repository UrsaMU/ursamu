import type { IContext } from "../../@types/IContext.ts";
import { moniker } from "../../utils/moniker.ts";
import { dbojs } from "../Database/index.ts";
import { send } from "../broadcast/index.ts";
import { flags } from "../flags/flags.ts";
import { force } from "./force.ts";
import { gameHooks } from "../Hooks/GameHooks.ts";
import { wsService } from "../WebSocket/index.ts";
import { isSoftcode } from "../../utils/isSoftcode.ts";

export const matchExits = async (ctx: IContext) => {
  if (ctx.socket.cid) {
    const en = await dbojs.queryOne({ id: ctx.socket.cid });
    if (!en) return false;

    en.data ||= {};
    const exits = await dbojs.query({
      $and: [{ flags: /exit/i }, { location: en.location || "" }],
    });

    // Hoist queries that are the same for every exit in the loop
    const players = await dbojs.query({
      $and: [
        { location: en.location || "" },
        { flags: /player/i },
        { flags: /connected/i },
        { id: { $ne: en.id } },
      ],
    });
    const room = await dbojs.queryOne({ id: en.location || "" });

    for (const exit of exits) {
      const name = exit.data?.name as string | undefined;
      if (!name || typeof name !== 'string') continue;
      const parts = name.split(";").map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
      const reg = new RegExp(`^(?:${parts.join("|")})$`, "i");
      const match = ctx.msg?.trim().match(reg);

      if (match) {
        const destination = exit.data?.destination as string | undefined;

        if (!destination) continue;
        const dest = await dbojs.queryOne({ id: destination });

        if (dest && flags.check(en.flags, (exit?.data?.lock as string) || "")) {
          // Check leave lock on current room
          const currentRoom = room;
          if (currentRoom) {
            const leaveLock = (currentRoom.data?.locks as Record<string, string>)?.leave;
            if (leaveLock) {
              const { evaluateLock, hydrate } = await import("../../utils/evaluateLock.ts");
              const allowed = await evaluateLock(leaveLock, hydrate(en), hydrate(currentRoom));
              if (!allowed) {
                send([ctx.socket.id], "You can't leave here.");
                return true;
              }
            }
          }

          // Check enter lock on destination room
          const enterLock = (dest.data?.locks as Record<string, string>)?.enter;
          if (enterLock) {
            const { evaluateLock, hydrate } = await import("../../utils/evaluateLock.ts");
            const allowed = await evaluateLock(enterLock, hydrate(en), hydrate(dest));
            if (!allowed) {
              send([ctx.socket.id], "You can't go that way.");
              return true;
            }
          }

          // Helpers to read and evaluate exit attributes
          const getExitAttr = (attrName: string): { value: string; type?: string } | undefined => {
            const attrs = exit.data?.attributes as Array<{ name: string; value: string; type?: string }> | undefined;
            return attrs?.find(a => a.name.toUpperCase() === attrName.toUpperCase());
          };

          const evalAttr = async (attrName: string, actorId: string): Promise<string | null> => {
            const attr = getExitAttr(attrName);
            if (!attr) return null;
            if (isSoftcode(attr)) {
              try {
                const { softcodeService } = await import("../Softcode/index.ts");
                return await softcodeService.runSoftcode(attr.value, {
                  actorId,
                  executorId: exit.id,
                  socketId:   ctx.socket.id,
                });
              } catch {
                return attr.value; // fall back to raw on error
              }
            }
            return attr.value;
          };

          if (!en.flags.includes("dark")) {
            ctx.socket.leave(`${en.location}`);

            const oleave = await evalAttr("OLEAVE", en.id);
            send(
              players.map((p) => p.id),
              oleave ? `${moniker(en)} ${oleave}` : `${moniker(en)} leaves for ${dest.data?.name}.`,
              {}
            );

            const leave = await evalAttr("LEAVE", en.id);
            if (leave) send([ctx.socket.id], leave, {});
          }

          en.location = dest?.id;
          await dbojs.modify({ id: en.id }, "$set", en);
          ctx.socket.join(`#${en.location}`);

          if (!en.flags.includes("dark") && room) {
            const arrivals = await dbojs.query({
              $and: [
                { location: en.location },
                { flags: /player/i },
                { flags: /connected/i },
                { id: { $ne: en.id } },
              ],
            });

            const oenter = await evalAttr("OENTER", en.id);
            send(
              arrivals.map((p) => p.id),
              oenter ? `${moniker(en)} ${oenter}` : `${moniker(en)} arrives from ${room?.data?.name}.`,
              {}
            );

            const enter = await evalAttr("ENTER", en.id);
            if (enter) send([ctx.socket.id], enter, {});
          }

          // Notify exit owner (ALEAVE / AENTER)
          const ownerId = exit.data?.owner as string | undefined;
          if (ownerId) {
            const ownerSocket = wsService.getConnectedSockets().find(s => s.cid === ownerId);
            if (ownerSocket) {
              const aleave = await evalAttr("ALEAVE", en.id);
              const aenter = await evalAttr("AENTER", en.id);
              if (aleave) send([ownerSocket.id], aleave, {});
              if (aenter) send([ownerSocket.id], aenter, {});
            }
          }

          gameHooks.emit("player:move", {
            actorId:      en.id,
            actorName:    moniker(en),
            fromRoomId:   room?.id  || "",
            toRoomId:     dest.id,
            fromRoomName: (room?.data?.name  as string) || "",
            toRoomName:   (dest.data?.name   as string) || "",
            exitName:     (name.split(";")[0]).trim(),
          }).catch(e => console.error("[GameHooks] player:move:", e));
          await force(ctx, "look");
          return true;
        } else {
          send([ctx.socket.id], "You can't go that way.");

          if (players.length > 0) {
            send(
              players.map((p) => p.id),
              `${moniker(en)} tries to go ${exit.data?.name}, but fails.`
            );
          }
          return true;
        }
      }
    }
  }

  return false;
};

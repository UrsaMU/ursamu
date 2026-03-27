import type { IContext } from "../../@types/IContext.ts";
import { moniker } from "../../utils/moniker.ts";
import { dbojs } from "../Database/index.ts";
import { send } from "../broadcast/index.ts";
import { flags } from "../flags/flags.ts";
import { force } from "./force.ts";
import { gameHooks } from "../Hooks/GameHooks.ts";
import { wsService } from "../WebSocket/index.ts";

export const matchExits = async (ctx: IContext) => {
  if (ctx.socket.cid) {
    const en = await dbojs.queryOne({ id: ctx.socket.cid });
    if (!en) return false;

    en.data ||= {};
    const exits = await dbojs.query({
      $and: [{ flags: /exit/i }, { location: en.location || "" }],
    });

    // Query departure room players ONCE before the loop
    const players = await dbojs.query({
      $and: [
        { location: en.location || "" },
        { flags: /player/i },
        { flags: /connected/i },
        { id: { $ne: en.id } },
      ],
    });
    const playerIds = new Set(players.map(p => p.id));
    const room = await dbojs.queryOne({ id: en.location || "" });
    const sockets = wsService.getConnectedSockets();

    for (const exit of exits) {
      const name = exit.data?.name as string | undefined;
      if (!name || typeof name !== 'string') continue;
      const parts = name.split(";").map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
      const reg = new RegExp(`^${parts.join("|")}$`, "i");
      const match = ctx.msg?.trim().match(reg);

      if (match) {
        const destination = exit.data?.destination as string | undefined;
        if (!destination) continue;
        const dest = await dbojs.queryOne({ id: destination });

        if (dest && flags.check(en.flags, (exit?.data?.lock as string) || "")) {
          // Helper to get a plain-text attribute value from exit.data.attributes
          const getExitAttr = (attrName: string): string | undefined => {
            const attrs = exit.data?.attributes as Array<{ name: string; value: string }> | undefined;
            return attrs?.find(a => a.name.toUpperCase() === attrName.toUpperCase())?.value;
          };

          if (!en.flags.includes("dark")) {
            ctx.socket.leave(`#${en.location}`);

            const oleave = getExitAttr("OLEAVE");
            // Send departure only to sockets of players in the room (by socket ID, not player ID)
            const departureSockets = sockets
              .filter(s => s.cid && playerIds.has(s.cid));
            if (departureSockets.length > 0) {
              send(
                departureSockets.map(s => s.id),
                oleave ? `${moniker(en)} ${oleave}` : `${moniker(en)} leaves for ${dest.data?.name}.`,
                {}
              );
            }

            const leave = getExitAttr("LEAVE");
            if (leave) send([ctx.socket.id], leave, {});
          }

          en.location = dest?.id;
          await dbojs.modify({ id: en.id }, "$set", { location: en.location } as Partial<typeof en>);
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

            const oenter = getExitAttr("OENTER");
            // Send arrival only to sockets of players in the destination room (by socket ID)
            const arrivalIds = new Set(arrivals.map(p => p.id));
            const arrivalSockets = sockets
              .filter(s => s.cid && arrivalIds.has(s.cid));
            if (arrivalSockets.length > 0) {
              send(
                arrivalSockets.map(s => s.id),
                oenter ? `${moniker(en)} ${oenter}` : `${moniker(en)} arrives from ${room?.data?.name}.`,
                {}
              );
            }

            const enter = getExitAttr("ENTER");
            if (enter) send([ctx.socket.id], enter, {});
          }

          // Notify exit owner (ALEAVE / AENTER)
          const aleave = getExitAttr("ALEAVE");
          const aenter = getExitAttr("AENTER");
          if (aleave || aenter) {
            const ownerId = exit.data?.owner as string | undefined;
            if (ownerId) {
              const ownerSocket = sockets.find(s => s.cid === ownerId);
              if (ownerSocket && aleave) send([ownerSocket.id], aleave, {});
              if (ownerSocket && aenter) send([ownerSocket.id], aenter, {});
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
          force(ctx, "look");
          return true;
        } else {
          send([ctx.socket.id], "You can't go that way.");

          if (players.length > 0) {
            const failSockets = sockets
              .filter(s => s.cid && playerIds.has(s.cid));
            if (failSockets.length > 0) {
              send(
                failSockets.map(s => s.id),
                `${moniker(en)} tries to go ${exit.data?.name}, but fails.`
              );
            }
          }
          return true;
        }
      }
    }
  }

  return false;
};

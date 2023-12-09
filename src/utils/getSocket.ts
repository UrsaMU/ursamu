import { IContext } from "../@types/IContext.ts";
import { IMSocket } from "../@types/IMSocket.ts";
import { io } from "../app.ts";
import { Obj } from "../services/DBObjs/index.ts";
import { joinChans } from "./joinChans.ts";

export const getSocket = async (id: number) => {
  const dbo = await Obj.get(id);
  if (!dbo) return;

  const sockets = io.sockets.sockets;

  for (const [id, sock] of sockets.entries()) {
    const socket = sock as IMSocket;

    if (socket.cid === dbo.id) {
      return socket;
    }
  }
};

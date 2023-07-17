import { IContext } from "../@types/IContext";
import { IMSocket } from "../@types/IMSocket";
import { io } from "../app";
import { Obj } from "../services/DBObjs";
import { joinChans } from "./joinChans";

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

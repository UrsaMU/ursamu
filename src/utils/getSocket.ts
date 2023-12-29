import { io } from "../app.ts";
import { Obj } from "../services/DBObjs/index.ts";


export const getSocket = async (id: number) => {
  const dbo = await Obj.get(id);
  if (!dbo) return;

  const sockets = await io.fetchSockets();

  for (const [id, sock] of sockets.entries()) {
    const socket = sock as any;

    if (socket.cid === dbo.id) {
      return socket;
    }
  }
};

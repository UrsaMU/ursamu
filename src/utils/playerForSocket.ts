import { dbojs } from "../services/Database/index.ts";
import { IMSocket } from "../@types/IMSocket.ts";

export const playerForSocket = async (socket: IMSocket) => {
  if (!socket.cid) return false;
  return await dbojs.queryOne({ id: socket.cid });
};

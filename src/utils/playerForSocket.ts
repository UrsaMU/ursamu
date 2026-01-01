import { dbojs } from "../services/Database/index.ts";
import { UserSocket } from "../@types/IMSocket.ts";

export const playerForSocket = async (socket: UserSocket) => {
  if (!socket.cid) return false;
  return await dbojs.queryOne({ id: socket.cid });
};

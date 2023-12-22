import { dbojs } from "../services/Database/index.ts";

export const playerForSocket = async (socket: IMSocket) => {
  return await dbojs.queryOne({ id: socket.cid });
};

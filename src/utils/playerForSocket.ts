import { dbojs } from "../services/Database/index.ts";

export const playerForSocket = async (socket: IMSocket) => {
  const ret = await dbojs.query({ id: socket.cid });
  return ret.length ? ret[0] : false;
});

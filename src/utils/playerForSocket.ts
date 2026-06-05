import type { IDBOBJ } from "../@types/IDBObj.ts";
import type { UserSocket } from "../@types/IMSocket.ts";
import { dbojs } from "@ursamu/mush";

/** Fetch the DB object for an authenticated socket. Returns null when unauthenticated. */
export const playerForSocket = async (socket: UserSocket): Promise<IDBOBJ | null | undefined> => {
  if (!socket.cid) return null;
  return await dbojs.queryOne({ id: socket.cid });
};

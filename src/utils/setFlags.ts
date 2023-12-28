import { IDBOBJ } from "../@types/IDBObj.ts";
import { flags } from "../services/flags/flags.ts";
import { dbojs } from "../services/Database/index.ts";
import { IContext } from "../@types/IContext.ts";
import { joinChans } from "./joinChans.ts";
import { getSocket } from "./getSocket.ts";

export const setFlags = async (dbo: IDBOBJ, flgs: string) => {
  const { data, tags } = flags.set(dbo.flags, dbo.data || {}, flgs);
  dbo.flags = tags;
  dbo.data = data;
  delete dbo._id;

  const socket = await getSocket(dbo.id);
  const done = await dbojs.modify({ id: dbo.id }, "$set", dbo);

  if (socket) {
    const ctx: IContext = { socket, msg: "l", data: {} };
    await joinChans(ctx);
  }

  return done.length ? done[0] : done;
};

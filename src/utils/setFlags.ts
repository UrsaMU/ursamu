import { IDBOBJ } from "../@types/IDBObj.ts";
import { flags } from "../services/flags/flags.ts";
import { dbojs } from "../services/Database";
import { IContext } from "../@types/IContext.ts";
import { joinChans } from "./joinChans.ts";
import { getSocket } from "./getSocket.ts";

export const setFlags = async (dbo: IDBOBJ, flgs: string) => {
  const { data, tags } = flags.set(dbo.flags, dbo.data || {}, flgs);
  dbo.flags = tags;
  dbo.data = data;

  const socket = await getSocket(dbo.id);
  const done = await dbojs.update({ id: dbo.id }, dbo);

  if (socket) {
    const ctx: IContext = { socket, msg: "l", data: {} };
    await joinChans(ctx);
  }

  return done;
};

import { IDBOBJ } from "../@types/IDBObj";
import { flags } from "../services/flags/flags";
import { dbojs } from "../services/Database";
import { IContext } from "../@types/IContext";
import { joinChans } from "./joinChans";
import { getSocket } from "./getSocket";

export const setFlags = async (dbo: IDBOBJ, flgs: string) => {
  const { data, tags } = flags.set(dbo.flags, dbo.data || {}, flgs);
  dbo.flags = tags;
  dbo.data = data;

  const socket = await getSocket(dbo.id);
  const updateData = {
    flags: dbo.flags,
    data: dbo.data,
    location: dbo.location,
  };

  const done = await dbojs.update({ id: dbo.id }, { $set: updateData });

  if (socket) {
    const ctx: IContext = { socket, msg: "l", data: {} };
    await joinChans(ctx);
  }

  return done;
};

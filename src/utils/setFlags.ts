import { IDBOBJ } from "../@types/IDBObj";
import { flags } from "../services/flags/flags";
import { dbojs } from "../services/Database";

export const setFlags = async (dbo: IDBOBJ, flgs: string) => {
  const { data, tags } = flags.set(dbo.flags, dbo.data || {}, flgs);
  dbo.flags = tags;
  dbo.data = data;
  await dbojs.update({ _id: dbo._id }, dbo);
  return dbo;
};

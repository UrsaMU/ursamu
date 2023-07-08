import { IDBOBJ } from "../@types/IDBObj";
import { dbojs } from "../services/Database";
import { flags } from "../services/flags/flags";

export const set = async (target: IDBOBJ, flgs: string) => {
  target.data ||= {};
  const { tags, data } = flags.set(target.flags, target.data, flgs);
  target.flags = tags;
  target.data = data;
  await dbojs.update({ _id: target._id }, target);
  return target;
};

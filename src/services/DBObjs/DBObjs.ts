import { dbojs } from "../Database";
import { flags } from "../flags/flags";

export const createObj = async (flgs: string, datas: any) => {
  const { tags, data } = flags.set("", datas, flgs);
  const obj = {
    id: (await dbojs.count({})) + 1,
    flags: tags,
    data,
  };

  return await dbojs.insert(obj);
};

import { getNextId } from "../../utils/getNextId";
import { dbojs } from "../Database";
import { flags } from "../flags/flags";

export const createObj = async (flgs: string, datas: any) => {
  const id = await getNextId("objid");
  const { tags, data } = flags.set("", datas, flgs);
  const obj = {
    id,
    flags: tags,
    data,
  };

  return await dbojs.insert(obj);
};

import { stats } from "../..";

export const getStat = async (name: string) => {
  return await stats.findOne({ name });
};

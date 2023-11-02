import { stats } from "../..";

export const getStats = async () => {
  return await stats.findAll();
};

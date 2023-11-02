import { stats } from "../../";
import { IMStat } from "../../../@types";

export const addStat = async (stat: IMStat) => {
  const find = await stats.findOne({ name: stat.name });
  if (!find) {
    await stats.insert(stat);
  } else {
    await stats.update({ name: stat.name }, stat);
  }
};

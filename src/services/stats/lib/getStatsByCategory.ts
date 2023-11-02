import { stats } from "../..";

export const getStatsByCategory = async (category: string) => {
  const find = await stats.find({ category });
  return find.sort((a, b) => b.name.localeCompare(b.name));
};

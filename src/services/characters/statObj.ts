import { allStats } from ".";

export const statObj = (stat: string) => {
  return allStats.find((s) =>
    s.name.toLowerCase().startsWith(stat.toLowerCase())
  );
};

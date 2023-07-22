import { IDBOBJ } from "../@types";
import { allStats } from "../services";

export const getStat = (character: IDBOBJ, stat: string) => {
  // first we need to see if the player has the stat in their data.
  const statEntry = character.data?.stats?.find((s) =>
    s.name.toLowerCase().startsWith(stat.toLowerCase())
  );

  // if they do, we'll return the value.
  if (statEntry) {
    return statEntry.value;
  }

  // if they don't, we'll check to see if the stat is a valid stat.
  const statObj = allStats.find((s) =>
    s.name.toLowerCase().startsWith(stat.toLowerCase())
  );

  // if it is, we'll return the default value.
  if (statObj) {
    return statObj.default;
  }

  // if it's not, we'll return  "".
  return "";
};

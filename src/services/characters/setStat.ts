import { IDBOBJ } from "../../@types";
import { dbojs } from "../Database";
import { flags } from "../flags";
import { IMStat, allStats } from "./stats";

export const setStat = async (character: IDBOBJ, stat: string, value: any) => {
  for (const tempStat of allStats as IMStat[]) {
    if (tempStat.name.toLowerCase() === stat.toLowerCase()) {
      // see if value is a number. if not, try to convert it to a number,
      // and if that fails, it's a string and leave it alone.
      try {
        value = parseInt(value as any);
      } catch (e) {}

      if (!tempStat.values.includes(value) && value) {
        throw new Error(`Invalid value for ${stat}.`);
      }

      if (!flags.check(character.flags || "", tempStat.lock || "")) {
        throw new Error(`You do not have permission to set ${stat}.`);
      }

      character.data ||= {};
      character.data.stats ||= {};

      if (!value) {
        delete character.data.stats[stat];
        await dbojs.update({ id: character.id }, character);
        return character;
      }

      character.data.stats[stat] = value;
      await dbojs.update({ id: character.id }, character);
      return character;
    }
  }
};

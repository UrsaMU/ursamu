import { IDBOBJ } from "../../@types";
import { dbojs } from "../Database";
import { flags } from "../flags";
import { IMStat, IMStatEntry, allStats } from "./stats";

export const setStat = async (
  character: IDBOBJ,
  stat: string,
  value: any,
  type?: string
) => {
  for (const tempStat of allStats as IMStat[]) {
    if (tempStat.name.toLowerCase() === stat.toLowerCase()) {
      // see if value is a number. if not, try to convert it to a number,
      // and if that fails, it's a string and leave it alone.
      let tempvalue = parseInt(value as any);
      if (!isNaN(tempvalue)) value = tempvalue;

      if (
        !tempStat.values.includes(value) &&
        value &&
        tempStat.values.length > 0
      ) {
        throw new Error(
          `Invalid value for ${stat}. Valid values are: ${tempStat.values
            .map((v) => `%ch${v}%cn`)
            .join(", ")}`
        );
      }

      if (!flags.check(character.flags || "", tempStat.lock || "")) {
        throw new Error(`You do not have permission to set ${stat}.`);
      }

      character.data ||= {};
      character.data.stats ||= [];

      if (!value) {
        character.data.stats = character.data.stat.filter(
          (s: IMStatEntry) => s.name.toLowerCase() !== stat.toLowerCase()
        );
        await dbojs.update({ id: character.id }, character);
        return character;
      }

      const statIndex = character.data.stats.findIndex(
        (s: IMStatEntry) => s.name.toLowerCase() === stat.toLowerCase()
      );

      if (statIndex > -1) {
        character.data.stats[statIndex].temp = value;
        character.data.stats[statIndex].value = value;
      } else {
        character.data.stats.push({
          name: stat,
          value,
          temp: value,
          type,
        });
      }

      await dbojs.update({ id: character.id }, character);
      return character;
    }
  }
};

export const getStat = (character: IDBOBJ, stat: string) => {
  for (const tempStat of allStats as IMStat[]) {
    if (tempStat.name.toLowerCase() === stat.toLowerCase()) {
      character.data ||= {};
      character.data.stats ||= [];

      const statIndex = character.data.stats.findIndex(
        (s: IMStatEntry) => s.name.toLowerCase() === stat.toLowerCase()
      );

      if (statIndex > -1) {
        return character.data.stats[statIndex].value;
      } else {
        return tempStat.default;
      }
    }
  }
};

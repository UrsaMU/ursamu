import { IDBOBJ, IMStatEntry } from "../../@types/index.ts";
import { Obj } from "../DBObjs/index.ts";
import { dbojs } from "../Database/index.ts";
import { allStats } from "./index.ts";

export async function validateValue(char: IDBOBJ, stat: IDBOBJ, value: any) : boolean {
  const splat = character.splat || "";

  if(typeof fullStat.values == "function") {
    return fullStat.values(char, value)
  } else {
    return fullStat.values.includes(value) && fullStat.values.length > 0 && value
  }
}

export const setStat = async (
  character: IDBOBJ,
  stat: string,
  value: any,
  temp?: boolean,
) => {
  let tar, val;
  let specialty = "";
  let instance = "";

  const parts = stat.split("/");
  if (parts.length > 1) {
    tar = parts[0].trim().toLowerCase();
    stat = parts[1].trim().toLowerCase();
  }

  // Either use the target or the enactor if no target exists.
  character.data ||= {};
  character.data.stats ||= [];

  // check to see if stat has an instance to it.
  const instanced = stat.trim().match(/\((.*)\)/g);

  if (instanced) {
    stat = stat.replace(/\((.*)\)/g, "").trim();

    instance = instanced[0];
  }

  // get the full stat name from the partial name.
  const fullStat = allStats.find((s) =>
    s.name.toLowerCase().startsWith(stat!.toLowerCase().trim())
  );

  if (!fullStat) throw new Error("Invalid stat.");

  // check to see  if the stat us even inatnaced.
  if (instance && !fullStat.hasInstance) throw new Error("Invalid instance().");

  if (instance && fullStat.hasInstance && fullStat.instances?.length) {
    const inst = fullStat.instances?.find(
      (i) => i.toLowerCase() === instance.toLowerCase(),
    );
    if (!inst) throw new Error("Invalid instance().");
  }

  if (fullStat.hasInstance && !instance) throw new Error("Missing instance().");

  // check to see if the instance is valid.

  // Check for specialities.
  // --------------------------------------------------------------------
  // ie.  when the value has a / in it.
  // ex:  +stats me/academics=1/library research
  const charObj = await Obj.get(character.id);
  if (!charObj) throw new Error("Invalid character.");

  if (value?.includes("/")) {
    const [value1, value2] = value.split("/");
    value = value1.trim();
    specialty = value2.trim().toLowerCase();

    //  convert value if needed.
    if (!isNaN(+value)) value = +value;

    //  if there's a check on the specialty, see if it passes.
    if (fullStat.specialties) {
      const specObj = fullStat.specialties?.find((s) => s.name === specialty);

      if (!specObj && fullStat.specialties?.length) {
        throw new Error("Invalid specialty.");
      }

      if (!validateValue(charObj, specObj, value)) {
        throw new Error("Invalid specialty value.");
      }

      if (specObj && specObj.check && !specObj.check(charObj)) {
        throw new Error(specObj.error || "Permission denied.");
      }
    }
  }
  //  convert value if needed.
  if (!isNaN(+value)) value = +value;

  // Check the value
  if (!validateValue(charObj, fullStat, value)) {
    throw new Error(`Invalid value for ${fullStat.name.toUpperCase()}.`);
  }

  // Check the splat
  if (fullStat.splat && !fullStat.splat.includes(charObj.splat)) {
    throw new Error(fullStat.error || "Permission denied.");
  }

  // if there's a check on the stat, see if it passes.
  if (fullStat.check && !fullStat.check(charObj)) {
    throw new Error(fullStat.error || "Permission denied.");
  }

  // Set the stats (or specialty!)!
  // --------------------------------------------------------------------
  if (instance) {
    stat = fullStat.name + instance;
  } else {
    stat = fullStat.name;
  }

  const name = specialty || stat;
  const type = specialty ? fullStat.name : fullStat.type;

  if (!value && !temp) {
    character.data.stats = character.data.stats.filter(
      (s: IMStatEntry) => s.name.toLowerCase() !== name,
    );

    // remove any specialties that exist for this stat.
    if (fullStat.hasSpecialties) {
      character.data.stats = character.data.stats.filter(
        (s: IMStatEntry) => s.type !== fullStat.name,
      );
    }

    await dbojs.modify({ id: character.id }, "$set", character);
    return name;
  } else if (!value && temp) {
    character.data.stats = character.data.stats.map((s: IMStatEntry) => {
      if (s.name.toLowerCase() === name) {
        s.temp = s.value;
      }
      return s;
    });

    await dbojs.modify({ id: character.id }, "$set", character);
    return name;
  }

  // does the user already have an instance of the stat?
  const statEntry = character.data.stats.find((s) => s.name === name);

  if (statEntry) {
    if (!temp) {
      statEntry.value = value;
      statEntry.temp = value;
    } else {
      statEntry.temp = value;
    }
  } else {
    character.data.stats.push({
      name,
      value,
      temp: value,
      type,
      category: fullStat.category,
    });
  }

  await dbojs.modify({ id: character.id }, "$set", character);

  return name;
};

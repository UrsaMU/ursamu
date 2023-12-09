import { attributes } from "./stats/attributes.ts";
import { backgrounds } from "./stats/backgrounds.ts";
import { bio } from "./stats/bio.ts";
import { flaws } from "./stats/flaws.ts";
import { merits } from "./stats/merits.ts";
import { skills } from "./stats/skills.ts";
import { disciplines } from "./stats/disciplines.ts";
import { other } from "./stats/other.ts";

export * from "./attributes.ts";
export * from "./setStat.ts";
export * from "./getStats.ts";
export * from "./formatValue.ts";
export * from "./statObj.ts";

export const allStats = [
  ...bio,
  ...attributes,
  ...skills,
  ...merits,
  ...flaws,
  ...backgrounds,
  ...disciplines,
  ...other,
];

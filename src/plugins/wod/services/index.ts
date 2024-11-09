import { attributes } from "./stats/attributes";
import { backgrounds } from "./stats/backgrounds";
import { bio } from "./stats/bio";
import { flaws } from "./stats/flaws";
import { merits } from "./stats/merits";
import { skills } from "./stats/skills";
import { disciplines } from "./stats/disciplines";
import { other } from "./stats/other";

export * from "./attributes";
export * from "./setStat";
export * from "./getStats";
export * from "./formatValue";
export * from "./statObj";
export * from "./character"; // Added export for character module

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
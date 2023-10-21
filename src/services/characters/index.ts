import { attributes } from "./stats/attributes";
import { backgrounds } from "./stats/backgrounds";
import { bio } from "./stats/bio";
import { flaws } from "./stats/flaws";
import { merits } from "./stats/merits";
import { skills } from "./stats/skills";
import { disciplines } from "./stats/disciplines";

export * from "./attributes";
export * from "./setStat";
export * from "./getStats";
export * from "./formatValue";
export * from "./statObj";

export const allStats = [
  ...bio,
  ...attributes,
  ...skills,
  ...merits,
  ...flaws,
  ...backgrounds,
  ...disciplines,
];

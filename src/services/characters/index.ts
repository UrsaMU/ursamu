import { attributes } from "./attributes";
import { backgrounds } from "./backgrounds";
import { bio } from "./bio";
import { flaws } from "./flaws";
import { merits } from "./merits";
import { skills } from "./skills";

export * from "./setStat";
export * from "./getStats";
export * from "./formatValue";
export const allStats = [
  ...bio,
  ...attributes,
  ...skills,
  ...merits,
  ...flaws,
  ...backgrounds,
];

import { attributes } from "./stats/attributes.ts";
import { bio } from "./stats/bio.ts";
import { skills } from "./stats/skills.ts";

export * from "./attributes.ts";
export * from "./setStat.ts";
export * from "./getStats.ts";
export * from "./formatValue.ts";
export * from "./statObj.ts";

export let allStats = [
  ...bio,
  ...attributes,
  ...skills,
];

export function setAllStats(newStats: array) : array {
  allStats = newStats;
}

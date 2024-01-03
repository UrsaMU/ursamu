import { IMStat } from "../../src/@types/index.ts";
import { flags } from "../../src/services/flags/index.ts";
import { getStat } from "../../src/services/characters/getStats.ts";

export const other: IMStat[] = [
  {
    name: "humanity",
    values: [1, 2, 3, 4, 5, 6, 7, 8, 9],
    type: "other",
    splat: ["vampire", "mortal"],
    check: (obj) => flags.check(obj.flags, "admin+"),
    default: 7,
  },
  {
    name: "blood potency",
    values: [1, 2, 3, 4, 5, 6, 7, 8, 9],
    type: "other",
    splat: ["vampire"],
  },
  {
    name: "hunger",
    type: "other",
    values: [0, 1, 2, 3, 4, 5],
    default: 0,
  },
];

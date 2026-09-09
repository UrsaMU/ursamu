// WtA breeds -- source: resources/wta20th.txt pp.112-113
import type { IBreedDef } from "../../../core/types.ts";

export const WTA_BREEDS: IBreedDef[] = [
  {
    id: "homid",
    name: "Homid",
    initialGnosis: 1,
    beginningGifts: [
      "Apecraft's Blessings",
      "City Running",
      "Master of Fire",
      "Persuasion",
      "Smell of Man",
    ],
  },
  {
    id: "metis",
    name: "Metis",
    initialGnosis: 3,
    beginningGifts: [
      "Craft Elemental",
      "Primal Anger",
      "Rat Head",
      "Sense Wyrm",
      "Stench",
    ],
    notes: "Metis characters must choose a deformity during character creation.",
  },
  {
    id: "lupus",
    name: "Lupus",
    initialGnosis: 5,
    beginningGifts: [
      "Hare's Leap",
      "Heightened Senses",
      "Predator's Arsenal",
      "Sense Wyrm",
      "Sense the Unnatural",
    ],
  },
];

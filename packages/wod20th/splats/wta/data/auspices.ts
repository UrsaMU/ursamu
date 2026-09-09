// WtA auspices -- source: resources/wta20th.txt pp.112-113
import type { IAuspiceDef } from "../../../core/types.ts";

export const WTA_AUSPICES: IAuspiceDef[] = [
  {
    id: "ragabash",
    name: "Ragabash",
    moon: "New Moon",
    initialRage: 1,
    beginningRenown: { glory: 0, honor: 0, wisdom: 0 }, // 3 in any combination
    renownFlex: true,
    beginningGifts: [
      "Blur of the Milky Eye",
      "Liar's Face",
      "Open Seal",
      "Scent of Running Water",
      "Spider's Song",
    ],
  },
  {
    id: "theurge",
    name: "Theurge",
    moon: "Crescent Moon",
    initialRage: 2,
    beginningRenown: { glory: 0, honor: 0, wisdom: 3 },
    renownFlex: false,
    beginningGifts: [
      "Mother's Touch",
      "Sense Wyrm",
      "Spirit Snare",
      "Spirit Speech",
      "Umbral Tether",
    ],
  },
  {
    id: "philodox",
    name: "Philodox",
    moon: "Half Moon",
    initialRage: 3,
    beginningRenown: { glory: 0, honor: 3, wisdom: 0 },
    renownFlex: false,
    beginningGifts: [
      "Fangs of Judgment",
      "Persuasion",
      "Resist Pain",
      "Scent of the True Form",
      "Truth of Gaia",
    ],
  },
  {
    id: "galliard",
    name: "Galliard",
    moon: "Gibbous Moon",
    initialRage: 4,
    beginningRenown: { glory: 2, honor: 0, wisdom: 1 },
    renownFlex: false,
    beginningGifts: [
      "Beast Speech",
      "Call of the Wyld",
      "Heightened Senses",
      "Mindspeak",
      "Perfect Recall",
    ],
  },
  {
    id: "ahroun",
    name: "Ahroun",
    moon: "Full Moon",
    initialRage: 5,
    beginningRenown: { glory: 2, honor: 1, wisdom: 0 },
    renownFlex: false,
    beginningGifts: [
      "Falling Touch",
      "Inspiration",
      "Pack Tactics",
      "Razor Claws",
      "Spur Claws",
    ],
  },
];

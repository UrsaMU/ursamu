// V20 clans -- VAMPIRE THE MASQUERADE 20th, Chapter Two.
import type { IClanDef } from "../../../core/types.ts";

export const VTM_CLANS: readonly IClanDef[] = [
  {
    id: "assamite",
    name: "Assamite",
    displayName: "Assamite",
    nickname: "Assassins",
    sect: "independent",
    disciplines: ["Celerity", "Obfuscate", "Quietus"],
    weakness:
      "Addicted to vitae; roll Self-Control to resist diablerie " +
      "when tasting Kindred blood (V20 p.46).",
    weaknessKind: "vitae_addict",
    book: "V20 p.46",
  },
  {
    id: "brujah",
    name: "Brujah",
    displayName: "Brujah",
    nickname: "Rabble",
    sect: "camarilla",
    disciplines: ["Celerity", "Potence", "Presence"],
    weakness:
      "Passion runs hot; +2 difficulty to resist frenzy " +
      "(V20 p.49).",
    weaknessKind: "frenzy_diff",
    frenzyDiffBonus: 2,
    book: "V20 p.49",
  },
  {
    id: "followers-of-set",
    name: "Followers of Set",
    displayName: "Followers of Set",
    nickname: "Setites",
    sect: "independent",
    disciplines: ["Obfuscate", "Presence", "Serpentis"],
    weakness:
      "Extreme vulnerability to bright light; extra damage " +
      "from sunlight (V20 p.52).",
    weaknessKind: "sun_extra",
    sunDamageBonus: 1,
    book: "V20 p.52",
  },
  {
    id: "gangrel",
    name: "Gangrel",
    displayName: "Gangrel",
    nickname: "Outlanders",
    sect: "independent",
    disciplines: ["Animalism", "Fortitude", "Protean"],
    weakness:
      "Each frenzy leaves an animal feature; every five " +
      "features cost 1 permanent Social Attribute " +
      "(V20 p.54).",
    weaknessKind: "animal_features",
    book: "V20 p.54",
  },
  {
    id: "giovanni",
    name: "Giovanni",
    displayName: "Giovanni",
    nickname: "Necromancers",
    sect: "independent",
    disciplines: ["Dominate", "Necromancy", "Potence"],
    weakness:
      "The Kiss causes excruciating pain; only 1 BP per " +
      "turn when feeding, and vessels rarely survive " +
      "(V20 p.56).",
    weaknessKind: "feed_rate",
    feedPerTurnMax: 1,
    book: "V20 p.56",
  },
  {
    id: "lasombra",
    name: "Lasombra",
    displayName: "Lasombra",
    nickname: "Keepers",
    sect: "sabbat",
    disciplines: ["Dominate", "Obtenebration", "Potence"],
    weakness:
      "Cast no reflection; cannot be seen in mirrors, " +
      "cameras, or still water (V20 p.59).",
    weaknessKind: "no_reflection",
    book: "V20 p.59",
  },
  {
    id: "malkavian",
    name: "Malkavian",
    displayName: "Malkavian",
    nickname: "Lunatics",
    sect: "camarilla",
    disciplines: ["Auspex", "Dementation", "Obfuscate"],
    weakness:
      "Permanently deranged; at least one Derangement " +
      "that can never be permanently overcome " +
      "(V20 p.62).",
    weaknessKind: "derangement",
    book: "V20 p.62",
  },
  {
    id: "nosferatu",
    name: "Nosferatu",
    displayName: "Nosferatu",
    nickname: "Sewer Rats",
    sect: "camarilla",
    disciplines: ["Animalism", "Obfuscate", "Potence"],
    weakness:
      "Hideously deformed; Appearance is 0 and cannot " +
      "be raised (V20 p.64).",
    appearanceZero: true,
    weaknessKind: "appearance_zero",
    book: "V20 p.64",
  },
  {
    id: "ravnos",
    name: "Ravnos",
    displayName: "Ravnos",
    nickname: "Deceivers",
    sect: "independent",
    disciplines: ["Animalism", "Chimerstry", "Fortitude"],
    weakness:
      "Compulsion toward a chosen vice; roll Self-Control " +
      "to resist when opportunity arises (V20 p.67).",
    weaknessKind: "vice",
    book: "V20 p.67",
  },
  {
    id: "toreador",
    name: "Toreador",
    displayName: "Toreador",
    nickname: "Degenerates",
    sect: "camarilla",
    disciplines: ["Auspex", "Celerity", "Presence"],
    weakness:
      "Entranced by beauty; roll Self-Control or stand " +
      "riveted for a scene (V20 p.70).",
    weaknessKind: "beauty_trance",
    book: "V20 p.70",
  },
  {
    id: "tremere",
    name: "Tremere",
    displayName: "Tremere",
    nickname: "Warlocks",
    sect: "camarilla",
    disciplines: ["Auspex", "Dominate", "Thaumaturgy"],
    weakness:
      "One step toward a blood bond to the clan; -1 die " +
      "to resist Dominate from higher-ranked Tremere " +
      "(V20 p.72).",
    weaknessKind: "clan_bond",
    book: "V20 p.72",
  },
  {
    id: "tzimisce",
    name: "Tzimisce",
    displayName: "Tzimisce",
    nickname: "Fiends",
    sect: "sabbat",
    disciplines: ["Animalism", "Auspex", "Vicissitude"],
    weakness:
      "Must sleep amid at least two handfuls of native " +
      "soil each day or lose half dice pools (V20 p.75).",
    weaknessKind: "soil_sleep",
    book: "V20 p.75",
  },
  {
    id: "ventrue",
    name: "Ventrue",
    displayName: "Ventrue",
    nickname: "Blue Bloods",
    sect: "camarilla",
    disciplines: ["Dominate", "Fortitude", "Presence"],
    weakness:
      "Restricted feeding preference chosen at Embrace; " +
      "cannot feed outside it (V20 p.77).",
    weaknessKind: "feed_restrict",
    book: "V20 p.77",
  },
  {
    id: "caitiff",
    name: "Caitiff",
    displayName: "Caitiff",
    nickname: "Clanless",
    sect: "anarch",
    disciplines: [],
    weakness:
      "No clan Disciplines or weakness; subject to " +
      "Storyteller approval on Discipline choices " +
      "(V20 p.83).",
    weaknessKind: "none",
    book: "V20 p.83",
  },
];

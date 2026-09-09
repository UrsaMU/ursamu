// V20 Paths of Enlightenment (condensed hierarchies).
import type { IPathDef } from "../../../core/types.ts";

/** Path of Humanity sins (V20 p.312) -- shared default. */
export const HUMANITY_SINS: Record<
  number,
  { label: string; examples: string }
> = {
  10: { label: "Selfish thoughts", examples: "petty cruelty" },
  9: { label: "Minor selfish acts", examples: "lying for gain" },
  8: { label: "Injury to another", examples: "hurting feelings" },
  7: { label: "Theft", examples: "petty theft" },
  6: { label: "Accidental violation", examples: "property damage" },
  5: { label: "Intentional property damage", examples: "arson" },
  4: {
    label: "Impassioned violation",
    examples: "manslaughter in rage",
  },
  3: {
    label: "Planned violation",
    examples: "planned murder / grievous harm",
  },
  2: {
    label: "Casual violation",
    examples: "casual / callous killing",
  },
  1: {
    label: "Utter perversion",
    examples: "heinous / prolonged torture",
  },
};

function sinsFrom(
  rows: Array<[number, string, string]>,
): Record<number, { label: string; examples: string }> {
  const out: Record<number, { label: string; examples: string }> = {};
  for (const [n, label, examples] of rows) {
    out[n] = { label, examples };
  }
  return out;
}

export const PATH_HUMANITY: IPathDef = {
  id: "humanity",
  name: "Humanity",
  checkVirtue: "Conscience",
  virtues: ["Conscience", "Self-Control", "Courage"],
  sins: { ...HUMANITY_SINS },
  book: "V20 p.312",
};

export const PATH_NIGHT: IPathDef = {
  id: "night",
  name: "Path of Night",
  checkVirtue: "Conviction",
  virtues: ["Conviction", "Instinct", "Courage"],
  sins: sinsFrom([
    [10, "Killing without purpose", "pointless slaughter"],
    [9, "Acting against the Beast needlessly", "denying hunger without cause"],
    [8, "Failing to show one's power", "hiding from lesser beings"],
    [7, "Helping others without gain", "charity"],
    [6, "Failing to ride the Beast", "suppressing frenzy always"],
    [5, "Accepting defeat", "surrender"],
    [4, "Accidental killing", "manslaughter"],
    [3, "Showing mercy to enemies", "sparing a foe"],
    [2, "Refusing to kill when needed", "hesitation"],
    [1, "Aiding the weak over the strong", "championing victims"],
  ]),
  book: "V20 p.318",
};

export const PATH_METAMORPHOSIS: IPathDef = {
  id: "metamorphosis",
  name: "Path of Metamorphosis",
  checkVirtue: "Conviction",
  virtues: ["Conviction", "Instinct", "Courage"],
  sins: sinsFrom([
    [10, "Postponing change", "stagnation"],
    [9, "Indulging base needs needlessly", "empty hedonism"],
    [8, "Refusing to experiment", "fear of new flesh"],
    [7, "Failing to improve the self", "neglecting the form"],
    [6, "Considering the needs of others", "empathy"],
    [5, "Emotional attachment", "love / friendship"],
    [4, "Failing to kill for knowledge", "wasted subject"],
    [3, "Refusing necessary sacrifice", "self-preservation over growth"],
    [2, "Aiding the unchanging", "propping up static beings"],
    [1, "Accepting human limits", "denying transcendence"],
  ]),
  book: "V20 p.320",
};

export const PATH_BLOOD: IPathDef = {
  id: "blood",
  name: "Path of Blood",
  checkVirtue: "Conviction",
  virtues: ["Conviction", "Self-Control", "Courage"],
  sins: sinsFrom([
    [10, "Failing to pursue knowledge of blood", "ignoring lore"],
    [9, "Showing disrespect to elders of the Path", "insolence"],
    [8, "Failing to destroy a lesser creature of Caine", "mercy on thin-blood"],
    [7, "Failing to diablerize a worthy vessel", "passing on Amaranth"],
    [6, "Succumbing to frenzy", "losing control"],
    [5, "Failing to pursue diablerie of an elder", "stagnation"],
    [4, "Acting against clan Assamite", "treason"],
    [3, "Failing to destroy a non-Assamite Kindred", "sparing outsiders"],
    [2, "Aiding non-Assamites against the clan", "betrayal"],
    [1, "Refusing a chance at diablerie", "denying the Path"],
  ]),
  book: "V20 p.316",
};

export const PATH_HONORABLE_ACCORD: IPathDef = {
  id: "honorable-accord",
  name: "Path of Honorable Accord",
  checkVirtue: "Conscience",
  virtues: ["Conscience", "Self-Control", "Courage"],
  sins: sinsFrom([
    [10, "Failing to show respect", "rudeness"],
    [9, "Failing to keep one's word", "minor lie"],
    [8, "Treating an inferior as an equal", "familiarity"],
    [7, "Failing to punish failure", "leniency"],
    [6, "Breaking a sworn oath", "oathbreaking"],
    [5, "Failing to protect the innocent under oath", "dereliction"],
    [4, "Killing without cause", "needless death"],
    [3, "Breaking a blood oath", "betrayal of bond"],
    [2, "Showing cowardice", "flight from duty"],
    [1, "Betrayal of a sworn lord", "treason"],
  ]),
  book: "V20 p.317",
};

export const ALL_PATHS: readonly IPathDef[] = [
  PATH_HUMANITY,
  PATH_NIGHT,
  PATH_METAMORPHOSIS,
  PATH_BLOOD,
  PATH_HONORABLE_ACCORD,
];

export function getPath(idOrName: string): IPathDef | undefined {
  const q = idOrName.toLowerCase().trim();
  return ALL_PATHS.find(
    (p) =>
      p.id === q ||
      p.name.toLowerCase() === q ||
      p.name.toLowerCase().includes(q) ||
      p.id.replace(/-/g, " ") === q,
  );
}

export function pathForChar(pathName: string | undefined): IPathDef {
  if (!pathName) return PATH_HUMANITY;
  return getPath(pathName) ?? PATH_HUMANITY;
}

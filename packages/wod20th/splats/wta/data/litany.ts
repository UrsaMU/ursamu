// splats/wta/data/litany.ts -- The Litany of the Garou (W20 pp. 25-26).
//
// Thirteen canon laws. Each has a severity and a renown-track penalty that
// is applied when a charge is /uphold'd by staff. Default penalties are
// tuned for game balance: minor breaches cost 1 temp renown, major cost 2,
// grave cost 3. Track choice follows canon spirit (Honor for breaches of
// social order, Wisdom for failures of judgment/secrecy, Glory for cowardice).
// Storytellers may override severity/penalty per chronicle.

export type LitanySeverity = "minor" | "major" | "grave";

export interface ILitanyLaw {
  slug: string;
  name: string;
  text: string;
  severity: LitanySeverity;
  penalty: {
    track: "glory" | "honor" | "wisdom";
    amount: number;
  };
}

export const LITANY_LAWS: Record<string, ILitanyLaw> = {
  "law-1": {
    slug: "law-1",
    name: "Garou Shall Not Mate With Garou",
    text:
      "Garou shall not mate with Garou. Such pairings produce sterile metis, " +
      "born sick and twisted. The breach is grave; the offspring bears the price.",
    severity: "grave",
    penalty: { track: "honor", amount: 3 },
  },
  "law-2": {
    slug: "law-2",
    name: "Combat the Wyrm Wherever It Dwells and Wherever It Breeds",
    text:
      "The Wyrm is the Garou's eternal foe. To stand idle in its presence, or " +
      "to refuse the hunt when called, is to forsake the duty Gaia laid on the People.",
    severity: "grave",
    penalty: { track: "glory", amount: 3 },
  },
  "law-3": {
    slug: "law-3",
    name: "Respect the Territory of Another",
    text:
      "A pack's bawn, a sept's caern, and a Garou's hunting ground are inviolate. " +
      "Trespass without howl of approach is an offense to alpha and Litany alike.",
    severity: "minor",
    penalty: { track: "honor", amount: 1 },
  },
  "law-4": {
    slug: "law-4",
    name: "Accept an Honorable Surrender",
    text:
      "When a foe yields with throat bared, accept the surrender. To slay the " +
      "submitting is to spend Honor for nothing and to invite the same fate.",
    severity: "major",
    penalty: { track: "honor", amount: 2 },
  },
  "law-5": {
    slug: "law-5",
    name: "Submission to Those of Higher Station",
    text:
      "Lower rank yields to higher in matters of pack, sept, and rite. A Cliath " +
      "does not gainsay an Athro; an Adren does not strike an Elder.",
    severity: "minor",
    penalty: { track: "honor", amount: 1 },
  },
  "law-6": {
    slug: "law-6",
    name: "The First Share of the Kill for the Greatest in Station",
    text:
      "The greatest hunter, the eldest Garou, or the sept alpha takes first " +
      "share of the kill. Greed at the kill is failure of pack discipline.",
    severity: "minor",
    penalty: { track: "honor", amount: 1 },
  },
  "law-7": {
    slug: "law-7",
    name: "Ye Shall Not Eat the Flesh of Humans",
    text:
      "Humans are kin to the People; their flesh is forbidden. The Garou who " +
      "tastes it walks the first step toward the Wyrm.",
    severity: "grave",
    penalty: { track: "wisdom", amount: 3 },
  },
  "law-8": {
    slug: "law-8",
    name: "Respect Those Beneath Ye -- All Are of Gaia",
    text:
      "Kinfolk, wolves, and humanity are Gaia's children. To brutalize them " +
      "without cause is to spit on the Mother who made us.",
    severity: "major",
    penalty: { track: "honor", amount: 2 },
  },
  "law-9": {
    slug: "law-9",
    name: "The Veil Shall Not Be Lifted",
    text:
      "Garou do not change before the unsuspecting. To break the Veil is to " +
      "loose the Delirium and to set humans hunting their wolf-cousins.",
    severity: "grave",
    penalty: { track: "wisdom", amount: 3 },
  },
  "law-10": {
    slug: "law-10",
    name: "Do Not Suffer Thy People to Be Tainted by the Wyrm",
    text:
      "A Garou touched by the Wyrm must be cleansed or destroyed. To hide such " +
      "a one, or to ignore the rot, is to risk the whole sept.",
    severity: "major",
    penalty: { track: "wisdom", amount: 2 },
  },
  "law-11": {
    slug: "law-11",
    name: "The Leader May Be Challenged at Any Time During Peace",
    text:
      "In peace, leadership is earned in the open. An alpha who refuses lawful " +
      "challenge has already lost the right to lead.",
    severity: "minor",
    penalty: { track: "honor", amount: 1 },
  },
  "law-12": {
    slug: "law-12",
    name: "The Leader May Not Be Challenged During Wartime",
    text:
      "In wartime, the alpha's word is law. To challenge in the moment of the " +
      "hunt is to fracture the pack and gift advantage to the Wyrm.",
    severity: "major",
    penalty: { track: "honor", amount: 2 },
  },
  "law-13": {
    slug: "law-13",
    name: "Ye Shall Take No Action That Causes a Caern to Be Violated",
    text:
      "The caern is Gaia's wellspring. To draw the enemy to its mouth, or to " +
      "weaken its wards by carelessness or design, is unforgivable.",
    severity: "grave",
    penalty: { track: "wisdom", amount: 3 },
  },
};

const LAW_LIST: ILitanyLaw[] = Object.values(LITANY_LAWS).sort((a, b) => {
  const an = parseInt(a.slug.slice(4), 10);
  const bn = parseInt(b.slug.slice(4), 10);
  return an - bn;
});

/** Lookup with own-property guard. */
export function getLaw(slug: string): ILitanyLaw | undefined {
  const key = (slug ?? "").toLowerCase().trim();
  if (!key) return undefined;
  if (!Object.prototype.hasOwnProperty.call(LITANY_LAWS, key)) return undefined;
  return LITANY_LAWS[key];
}

/** All thirteen laws, sorted by slug (law-1 .. law-13). */
export function allLaws(): ILitanyLaw[] {
  return LAW_LIST.slice();
}

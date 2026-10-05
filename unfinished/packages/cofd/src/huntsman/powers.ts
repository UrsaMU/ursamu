// Huntsman Dread Powers catalog (CtL p.265–266).

import type { HuntsmanPowerDef } from "./types.ts";

export const HUNTSMAN_POWERS: readonly HuntsmanPowerDef[] = [
  {
    slug: "among-the-sheep",
    name: "Among the Sheep",
    glamour: 2,
    willpower: 0,
    description:
      "Take any roughly humanoid form (Size 4–6); not a specific person. Tell remains.",
    book: "CtL p.265",
  },
  {
    slug: "apex-predator",
    name: "Apex Predator",
    glamour: 1,
    willpower: 0,
    description:
      "Conjure swarm or command a beast appropriate to nature.",
    book: "CtL p.265",
  },
  {
    slug: "command-the-herald",
    name: "Command the Herald",
    glamour: 1,
    willpower: 0,
    description:
      "Remote view via a touched herald creature (1G per hour).",
    book: "CtL p.265",
  },
  {
    slug: "heart-of-iron",
    name: "Heart of Iron",
    glamour: 0,
    willpower: 0,
    description:
      "No fear of cold iron; often wield it. Permanent.",
    book: "CtL p.265",
  },
  {
    slug: "hungry-heart",
    name: "Hungry Heart",
    glamour: 0,
    willpower: 1,
    description:
      "On hit vs Lost/Fae with panoply: steal Glamour = successes.",
    book: "CtL p.266",
  },
  {
    slug: "hunters-panoply",
    name: "Hunter's Panoply",
    glamour: 0,
    willpower: 0,
    description:
      "8-again with panoply tools; call lost tools to hand.",
    book: "CtL p.266",
  },
  {
    slug: "hunters-senses",
    name: "Hunter's Senses",
    glamour: 0,
    willpower: 0,
    description:
      "Track quarry; +quarry Wyrd when their Mask is down.",
    book: "CtL p.266 / p.83",
  },
  {
    slug: "inescapable-snare",
    name: "Inescapable Snare",
    glamour: 2,
    willpower: 0,
    description:
      "Lay a snare; victim may take Immobilized (ST).",
    book: "CtL p.266",
  },
  {
    slug: "kindred-spirits",
    name: "Kindred Spirits",
    glamour: 1,
    willpower: 0,
    description:
      "Learn Needle, Thread, Aspirations, Clarity; more G for wounds/Touchstones.",
    book: "CtL p.266",
  },
  {
    slug: "surprise-entrance",
    name: "Surprise Entrance",
    glamour: 1,
    willpower: 0,
    description:
      "Appear suddenly via threshold/shadow (ST placement).",
    book: "CtL p.266",
  },
  {
    slug: "watchful-gaze",
    name: "Watchful Gaze",
    glamour: 1,
    willpower: 0,
    description:
      "Sense when quarry speaks the Huntsman's name or title.",
    book: "CtL p.266",
  },
];

export function findHuntsmanPower(
  key: string,
): HuntsmanPowerDef | null {
  const q = key.toLowerCase().trim();
  return (
    HUNTSMAN_POWERS.find(
      (p) =>
        p.slug === q ||
        p.name.toLowerCase() === q ||
        p.name.toLowerCase().includes(q),
    ) ?? null
  );
}

export function defaultHuntsmanPowers(wyrd: number): string[] {
  const base = [
    "among-the-sheep",
    "heart-of-iron",
    "hunters-senses",
    "hunters-panoply",
  ];
  if (wyrd >= 3) base.push("kindred-spirits", "apex-predator");
  if (wyrd >= 4) {
    base.push("inescapable-snare", "surprise-entrance");
  }
  if (wyrd >= 5) base.push("hungry-heart", "command-the-herald");
  return base;
}

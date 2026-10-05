// Hollow Merit enhancement catalog (CtL 2e p.116).

/** Catalog enhancement slug → dots cost. */
export interface HollowEnhancementDef {
  slug: string;
  name: string;
  cost: number;
  /** Max times / dots if variable (size, escape). */
  maxCost?: number;
  description: string;
  book: string;
}

export const HOLLOW_ENHANCEMENTS: readonly HollowEnhancementDef[] = [
  {
    slug: "hob-alarm",
    name: "Hob Alarm",
    cost: 1,
    description:
      "No surprise Defense loss; +rating dice first turn (Debt/story).",
    book: "CtL p.116",
  },
  {
    slug: "luxury-goods",
    name: "Luxury Goods",
    cost: 1,
    description:
      "Mundane/Hedgespun supplies on hand (ST Availability ≤ successes).",
    book: "CtL p.116",
  },
  {
    slug: "shadow-garden",
    name: "Shadow Garden",
    cost: 1,
    description:
      "Eaten fruit reappears as shadow copies (no real benefit).",
    book: "CtL p.116",
  },
  {
    slug: "phantom-phone",
    name: "Phantom Phone Booth",
    cost: 1,
    description:
      "Call out of the Hedge; untraceable (RP/ST).",
    book: "CtL p.116",
  },
  {
    slug: "route-zero",
    name: "Route Zero",
    cost: 1,
    description:
      "One-dot trod loop; nav once/day, regain 1 WP on success.",
    book: "CtL p.116",
  },
  {
    slug: "size",
    name: "Size Matters",
    cost: 1,
    maxCost: 2,
    description:
      "• motley space; •• estate/town scale.",
    book: "CtL p.116",
  },
  {
    slug: "escape-route",
    name: "Escape Route",
    cost: 1,
    maxCost: 2,
    description:
      "• fixed one-way exit; •• reflexive anywhere in Hollow.",
    book: "CtL p.116",
  },
  {
    slug: "hidden-entry",
    name: "Hidden Entry",
    cost: 2,
    description:
      "Entrance vanishes when all owners inside (−2 find/force).",
    book: "CtL p.116",
  },
  {
    slug: "easy-access",
    name: "Easy Access",
    cost: 3,
    description:
      "Enter from any unlocked mortal door for 1 Glamour.",
    book: "CtL p.116",
  },
  {
    slug: "home-turf",
    name: "Home Turf",
    cost: 3,
    description:
      "+rating Initiative and Defense vs intruders inside.",
    book: "CtL p.116",
  },
];

export function findHollowEnhancement(
  slug: string,
): HollowEnhancementDef | null {
  const q = slug.toLowerCase().trim();
  return (
    HOLLOW_ENHANCEMENTS.find(
      (e) =>
        e.slug === q ||
        e.name.toLowerCase() === q ||
        e.name.toLowerCase().includes(q),
    ) ?? null
  );
}

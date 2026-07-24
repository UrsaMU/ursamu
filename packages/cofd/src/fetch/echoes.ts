// Fetch Echo catalog (CtL p.235–236).

import type { EchoDef, EchoSlug } from "./types.ts";

export const ECHOES: readonly EchoDef[] = [
  {
    slug: "attuned",
    name: "Attuned to the Wyrd",
    minWyrd: 0,
    automatic: true,
    glamour: 0,
    description:
      "See miens; sense changelings in 50 ft; never surprised by Lost.",
    book: "CtL p.235",
  },
  {
    slug: "normalcy",
    name: "Normalcy",
    minWyrd: 1,
    glamour: 0,
    description:
      "Undetectable by fae magic while on; must drop to use other Echoes.",
    book: "CtL p.236",
  },
  {
    slug: "heart-of-wax",
    name: "Heart of Wax",
    minWyrd: 1,
    glamour: 1,
    description:
      "Ignore wound penalties; 1G shed one physical Tilt for the scene.",
    book: "CtL p.236",
  },
  {
    slug: "enter-hedge",
    name: "Enter the Hedge",
    minWyrd: 1,
    glamour: 0,
    description:
      "May open/enter Hedgeways as a changeling can.",
    book: "CtL p.236",
  },
  {
    slug: "summon-shard",
    name: "Summon Shard",
    minWyrd: 1,
    glamour: 1,
    description:
      "Reflexive glass/mirror blade 1L (2L from mirror) for the scene.",
    book: "CtL p.236",
  },
  {
    slug: "mimic-contract",
    name: "Mimic Contract",
    minWyrd: 2,
    glamour: 1,
    description:
      "Use one Contract the original knows (met face-to-face; no loophole).",
    book: "CtL p.236",
  },
  {
    slug: "shadow-boxing",
    name: "Shadow Boxing",
    minWyrd: 2,
    glamour: 1,
    description:
      "Scene: original has no Defense vs this fetch (armor still applies).",
    book: "CtL p.236",
  },
  {
    slug: "shadow-step",
    name: "Shadow Step",
    minWyrd: 3,
    glamour: 1,
    description:
      "Step through shadows up to 100 yards (ST placement).",
    book: "CtL p.236",
  },
  {
    slug: "death-of-glamour",
    name: "Death of Glamour",
    minWyrd: 4,
    glamour: 10,
    description:
      "Zone: no Contracts; Glamour drains 1/turn (Res+Wyrd roll).",
    book: "CtL p.235",
  },
  {
    slug: "call-huntsmen",
    name: "Call the Huntsmen",
    minWyrd: 5,
    glamour: 0,
    description:
      "Spend all Glamour; beacon to Huntsmen (ST response).",
    book: "CtL p.235",
  },
];

export function findEcho(key: string): EchoDef | null {
  const q = key.toLowerCase().trim();
  return (
    ECHOES.find(
      (e) =>
        e.slug === q ||
        e.name.toLowerCase() === q ||
        e.name.toLowerCase().includes(q),
    ) ?? null
  );
}

/** Echoes available at a given Wyrd (including automatic). */
export function echoesForWyrd(wyrd: number): EchoDef[] {
  const w = Math.max(0, wyrd);
  return ECHOES.filter(
    (e) => e.automatic || e.minWyrd <= w,
  );
}

/** Default owned list for a new fetch at Wyrd. */
export function defaultOwnedEchoes(wyrd: number): string[] {
  return echoesForWyrd(wyrd)
    .filter((e) => e.automatic || e.minWyrd <= 1)
    .map((e) => e.slug);
}

export function isEchoSlug(s: string): s is EchoSlug {
  return ECHOES.some((e) => e.slug === s);
}

// core/derangement.ts -- Permanent derangements (V20 simplified).

import type { IWoDChar } from "./types.ts";
import { isKindred } from "./kindred.ts";
import { malkavianNeedsDerangement } from "./clanWeakness.ts";

export interface IDerangementDef {
  id: string;
  name: string;
  blurb: string;
  book: string;
}

export const DERANGEMENTS: readonly IDerangementDef[] = [
  {
    id: "paranoia",
    name: "Paranoia",
    blurb: "Everyone is a threat; hard to trust allies.",
    book: "V20 p.290",
  },
  {
    id: "megalomania",
    name: "Megalomania",
    blurb: "Obsessive need for power and recognition.",
    book: "V20 p.290",
  },
  {
    id: "schizophrenia",
    name: "Schizophrenia",
    blurb: "Voices and visions cloud judgment.",
    book: "V20 p.290",
  },
  {
    id: "multiple-personalities",
    name: "Multiple Personalities",
    blurb: "Distinct personas surface under stress.",
    book: "V20 p.290",
  },
  {
    id: "obsession",
    name: "Obsession",
    blurb: "Fixation on a person, object, or idea.",
    book: "V20 p.290",
  },
  {
    id: "hysteria",
    name: "Hysteria",
    blurb: "Panic under pressure; may freeze or flee.",
    book: "V20 p.290",
  },
  {
    id: "regression",
    name: "Regression",
    blurb: "Reverts to childlike behavior when stressed.",
    book: "V20 p.290",
  },
  {
    id: "sanguinary-animism",
    name: "Sanguinary Animism",
    blurb: "Believes the souls of vessels speak after feeding.",
    book: "V20 p.291",
  },
];

export function getDerangement(idOrName: string): IDerangementDef | undefined {
  const q = idOrName.toLowerCase().trim();
  return DERANGEMENTS.find(
    (d) =>
      d.id === q ||
      d.name.toLowerCase() === q ||
      d.name.toLowerCase().startsWith(q),
  );
}

export function listDerangements(char: IWoDChar): IDerangementDef[] {
  const ids = char.derangements ?? [];
  return ids
    .map((id) => getDerangement(id) ?? {
      id,
      name: id,
      blurb: "(custom)",
      book: "",
    });
}

export interface IDerangeResult {
  ok: boolean;
  message: string;
}

export function addDerangement(
  char: IWoDChar,
  raw: string,
): IDerangeResult {
  const def = getDerangement(raw);
  const id = def?.id ?? raw.toLowerCase().trim().replace(/\s+/g, "-");
  if (!id || id.length < 2) {
    return { ok: false, message: "Invalid derangement name." };
  }
  const cur = [...(char.derangements ?? [])];
  if (cur.some((x) => x.toLowerCase() === id)) {
    return { ok: false, message: `Already has ${def?.name ?? id}.` };
  }
  cur.push(id);
  char.derangements = cur;
  return {
    ok: true,
    message: `Derangement added: ${def?.name ?? id}.`,
  };
}

export function removeDerangement(
  char: IWoDChar,
  raw: string,
): IDerangeResult {
  const def = getDerangement(raw);
  const id = def?.id ?? raw.toLowerCase().trim().replace(/\s+/g, "-");
  const cur = [...(char.derangements ?? [])];
  const idx = cur.findIndex((x) => x.toLowerCase() === id);
  if (idx < 0) {
    return { ok: false, message: "Derangement not found on character." };
  }
  // Malkavian cannot drop below 1.
  if (malkavianNeedsDerangement(char) && cur.length <= 1) {
    return {
      ok: false,
      message:
        "Malkavian weakness: must retain at least one derangement.",
    };
  }
  // After removal check: if they are Malkavian and this is last, block.
  const clan = (char.clan ?? "").toLowerCase();
  if (clan === "malkavian" && cur.length <= 1) {
    return {
      ok: false,
      message:
        "Malkavian weakness: must retain at least one derangement.",
    };
  }
  cur.splice(idx, 1);
  char.derangements = cur.length ? cur : undefined;
  return {
    ok: true,
    message: `Derangement removed: ${def?.name ?? id}.`,
  };
}

/** Ensure Malkavian chargen/approval has a derangement. */
export function ensureMalkavianDerangement(
  char: IWoDChar,
  defaultId = "paranoia",
): void {
  if (!isKindred(char)) return;
  if ((char.clan ?? "").toLowerCase() !== "malkavian") return;
  if ((char.derangements?.length ?? 0) >= 1) return;
  char.derangements = [defaultId];
}

/**
 * Console loadout, software slots/RAM, system responses.
 */
import {
  CONSOLES,
  SOFTWARE,
  SYSTEM_RESPONSES,
  find,
  findByName,
  type Row,
} from "./catalog.ts";
import type { ISprawlChar } from "../db/schemas.ts";

export function listSoftware(): Row[] {
  return SOFTWARE;
}

export function resolveSoftware(q: string): Row | undefined {
  return find("software", q) ?? findByName(SOFTWARE, q);
}

export function resolveConsoleRow(
  slug?: string,
): Row | undefined {
  if (!slug) return undefined;
  return find("console", slug) ?? findByName(CONSOLES, slug);
}

export function hasSoftware(
  c: ISprawlChar,
  slug: string,
): boolean {
  return (c.software ?? []).includes(slug);
}

export function hasSavvyJack(c: ISprawlChar): boolean {
  return (c.augs ?? []).some((a) =>
    a.slug === "savvy-jack" ||
    String(a.name ?? "").toLowerCase().includes("savvy jack")
  );
}

export function softwareSlotCost(slug: string): number {
  const row = resolveSoftware(slug);
  const n = Number(row?.slots ?? 1);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1;
}

/** True unless catalog marks legal: true. */
export function softwareIsIllicit(slug: string): boolean {
  const row = resolveSoftware(slug);
  if (!row) return true;
  if (row.legal === true) return false;
  const tags = (row.tags as string[] | undefined) ?? [];
  if (tags.includes("legal")) return false;
  return true;
}

export type ConsoleSpec = {
  slug: string;
  name: string;
  row: Row;
  /** Hull RAM before purchase bonus / penalties. */
  baseRam: number;
  /** Effective RAM (base + purchased − penalties). */
  ram: number;
  /** Purchased extra RAM points. */
  ramBonus: number;
  /** Max software slots (or Cognition for Gestalt). */
  slots: number;
  /** Hull firewall before tunes. */
  baseFirewall: number;
  /** Effective firewall DS. */
  firewall: number;
  /** Firewall points from tune. */
  firewallBonus: number;
  /** Expert AI Cognition installed. */
  aiCog: number;
  /** Builtin AI from hull (e.g. Yurei). */
  hullAi: number;
  /** Action-roll bonus from this hull (+ AI assist). */
  bonus: number;
  tags: string[];
};

/**
 * Live console stats for a sheet.
 * Gestalt slots = Cognition. RAM includes consoleRamBonus.
 */
export function consoleSpec(
  c: ISprawlChar,
): ConsoleSpec | null {
  const row = resolveConsoleRow(c.console);
  if (!row || !c.console) return null;
  const tags = (row.tags as string[] | undefined) ?? [];
  const baseRam = Math.max(0, Number(row.ram ?? 1) || 1);
  const ramBonus = Math.max(
    0,
    Math.floor(Number(c.consoleRamBonus ?? 0) || 0),
  );
  const net = c.net ?? {};
  const t = Date.now();
  let ram = baseRam + ramBonus;
  if (net.driveBurned) ram = 0;
  else if (net.ramZeroUntil && net.ramZeroUntil > t) ram = 0;
  else if (net.ramPenalty) {
    ram = Math.max(0, ram - net.ramPenalty);
  }
  let slots: number;
  if (row.slots === "cognition") {
    const cog = Math.max(
      0,
      Math.floor(c.stats?.cognition ?? 1) -
        (net.cogPenalty ?? 0),
    );
    slots = Math.max(1, cog);
  } else {
    slots = Math.max(1, Number(row.slots) || 1);
  }
  const baseFirewall = Math.max(
    1,
    Number(row.firewall ?? 10) || 10,
  );
  const firewallBonus = Math.max(
    0,
    Math.floor(Number(c.consoleFirewallBonus ?? 0) || 0),
  );
  const hullAi = Math.max(0, Number(row.aiCognition ?? 0) || 0);
  const aiCog = Math.max(
    0,
    Math.floor(Number(c.consoleAiCog ?? 0) || 0),
  );
  const hullBonus = Math.max(0, Number(row.bonus ?? 1) || 0);
  // Expert AI assists hacks (+1 per Cog point installed / builtin)
  const aiAssist = hullAi + aiCog;
  return {
    slug: row.slug,
    name: String(row.name ?? row.slug),
    row,
    baseRam,
    ram,
    ramBonus,
    slots,
    baseFirewall,
    firewall: baseFirewall + firewallBonus,
    firewallBonus,
    aiCog,
    hullAi,
    bonus: hullBonus + aiAssist,
    tags,
  };
}

export function usedSoftwareSlots(c: ISprawlChar): number {
  // Lazy import avoided — packs handled in software-life
  const packs = c.softwarePacks ?? {};
  const packed = new Set<string>();
  for (const list of Object.values(packs)) {
    for (const s of list) packed.add(s);
  }
  let n = 0;
  for (const s of c.software ?? []) {
    if (packed.has(s)) continue;
    n += softwareSlotCost(s);
  }
  const spec = consoleSpec(c);
  // high-storage handled in freeSoftwareSlots
  void spec;
  return n;
}

export function freeSoftwareSlots(c: ISprawlChar): number {
  const spec = consoleSpec(c);
  if (!spec) return 0;
  let max = spec.slots;
  if (spec.tags.includes("high-storage")) max += 2;
  return Math.max(0, max - usedSoftwareSlots(c));
}

export function equipConsole(
  c: ISprawlChar,
  slug: string,
): ISprawlChar | { error: string } {
  const row = resolveConsoleRow(slug);
  if (!row) return { error: "unknown console" };
  const prev = c.net ?? {};
  const net = { ...prev };
  delete net.consoleBurned;
  delete net.driveBurned;
  delete net.malwareCleanDs;
  delete net.consoleDownUntil;
  delete net.ramPenalty;
  delete net.ramPenaltyUntil;
  delete net.ramZeroUntil;
  const next: ISprawlChar = {
    ...c,
    console: row.slug,
    consoleRamBonus: 0,
    consoleFirewallBonus: 0,
    consoleAiCog: 0,
    logicBomb: undefined,
    net,
  };
  const spec = consoleSpec(next);
  if (!spec) return { error: "unknown console" };
  const used = usedSoftwareSlots(next);
  if (used > spec.slots) {
    return {
      error:
        `too much software for ${row.slug} ` +
        `(${used}/${spec.slots} slots) — unload first`,
    };
  }
  return next;
}

export function installSoftware(
  c: ISprawlChar,
  slug: string,
): ISprawlChar | { error: string } {
  const row = resolveSoftware(slug);
  if (!row) return { error: "unknown software" };
  const spec = consoleSpec(c);
  if (!spec) {
    return { error: "equip a console first (+console/equip)" };
  }
  if (
    spec.tags.includes("needs-savvy-jack") &&
    !hasSavvyJack(c)
  ) {
    return {
      error: "Gestalt needs Savvy Jack aug to run software",
    };
  }
  if (
    spec.tags.includes("blocks-illicit") &&
    softwareIsIllicit(row.slug)
  ) {
    return {
      error: `${spec.name} safety filter blocks illicit software`,
    };
  }
  const have = c.software ?? [];
  if (have.includes(row.slug)) {
    return { error: "already loaded" };
  }
  const cost = softwareSlotCost(row.slug);
  const used = usedSoftwareSlots(c);
  let maxSlots = spec.slots;
  if (spec.tags.includes("high-storage")) maxSlots += 2;
  if (used + cost > maxSlots) {
    return {
      error:
        `console full (${used}/${maxSlots} slots` +
        (cost > 1 ? `, needs ${cost}` : "") +
        `)`,
    };
  }
  return { ...c, software: [...have, row.slug] };
}

export function removeSoftware(
  c: ISprawlChar,
  slug: string,
): ISprawlChar | { error: string } {
  const have = c.software ?? [];
  const row = resolveSoftware(slug);
  const target = row?.slug ?? slug.toLowerCase();
  if (!have.includes(target) &&
    !have.includes(slug.toLowerCase())
  ) {
    return { error: "not loaded" };
  }
  const soft = have.filter((s) => s !== target && s !== slug.toLowerCase());
  let next: ISprawlChar = { ...c, software: soft };
  const obs = (c.softwareObsolete ?? []).filter((s) => s !== target);
  next = {
    ...next,
    softwareObsolete: obs.length ? obs : undefined,
  };
  const packs = { ...(c.softwarePacks ?? {}) };
  for (const [d, list] of Object.entries(packs)) {
    packs[d] = list.filter((s) => s !== target);
    if (!packs[d]!.length) delete packs[d];
  }
  if (packs[target]) delete packs[target];
  next = {
    ...next,
    softwarePacks: Object.keys(packs).length ? packs : undefined,
  };
  return next;
}

/** Remove single-use software; multi-use stays loaded. */
export function burnSoftware(
  c: ISprawlChar,
  slug: string,
): ISprawlChar {
  const row = resolveSoftware(slug);
  if (!row || row.multiUse === true) return c;
  const r = removeSoftware(c, slug);
  return "error" in r ? c : r;
}

/**
 * Soft bonuses from loaded software for a hack attempt.
 * Uses catalog bonus + match regex when present.
 */
export function softwareHackBonus(
  c: ISprawlChar,
  exploitSlug?: string,
): { bonus: number; parts: string[]; absorbNeural: boolean } {
  let bonus = 0;
  const parts: string[] = [];
  let absorbNeural = false;
  const obsolete = new Set(c.softwareObsolete ?? []);
  const have = c.software ?? [];
  const ex = (exploitSlug ?? "").toLowerCase();

  for (const slug of have) {
    if (obsolete.has(slug)) continue;
    const row = resolveSoftware(slug);
    if (!row) continue;
    if (slug === "neuroshield" || row.effect === "neural-soak-2") {
      absorbNeural = true;
    }
    const b = Number(row.bonus ?? 0) || 0;
    if (b <= 0) continue;
    const match = String(row.match ?? "");
    if (match && ex) {
      try {
        if (!new RegExp(match, "i").test(ex)) continue;
      } catch {
        continue;
      }
    }
    // No exploit named, or match ok / no match field → apply
    bonus += b;
    parts.push(`${row.name ?? slug} +${b}`);
  }

  return { bonus, parts, absorbNeural };
}

export type SysResponse = {
  slug: string;
  name: string;
  blurb: string;
  /** Extra neural Res on top of margin (0–2). */
  extraNeural: number;
  forceGlitch: boolean;
  tags: string[];
  duration?: string;
  dsUp?: string;
  morphDs?: number;
  cleanDs?: string;
};

function responseExtra(row: {
  slug: string;
  extraNeural?: unknown;
  forceGlitch?: unknown;
}): {
  extraNeural: number;
  forceGlitch: boolean;
} {
  if (typeof row.extraNeural === "number") {
    return {
      extraNeural: row.extraNeural,
      forceGlitch: Boolean(row.forceGlitch),
    };
  }
  switch (row.slug) {
    case "neurostim-iii":
    case "surge-i":
    case "surge-ii":
      return { extraNeural: 2, forceGlitch: true };
    case "neurostim-iv":
    case "bio-electric-feedback":
    case "ice-i":
    case "ice-ii":
    case "back-hack":
      return { extraNeural: 1, forceGlitch: true };
    case "malware-ii":
    case "malware-iii":
    case "malware-iv":
    case "neurostim-i":
    case "neurostim-ii":
    case "overload":
      return { extraNeural: 1, forceGlitch: false };
    default:
      return { extraNeural: 0, forceGlitch: false };
  }
}

/** d66-weighted pick when rows have roll "11".."66". */
export function rollD66Index(
  rows: Row[],
  rng = Math.random,
): number {
  const tens = 1 + Math.floor(rng() * 6);
  const units = 1 + Math.floor(rng() * 6);
  const key = String(tens * 10 + units);
  const i = rows.findIndex(
    (r) => String(r.roll ?? "") === key,
  );
  if (i >= 0) return i;
  return Math.floor(rng() * rows.length) % rows.length;
}

/** Pick a system response (Nodejacker d66 table). */
export function rollSystemResponse(
  rng = Math.random,
): SysResponse {
  const rows = SYSTEM_RESPONSES;
  const i = rollD66Index(rows, rng);
  const r = rows[i];
  const fx = responseExtra(r);
  return {
    slug: r.slug,
    name: String(r.name ?? r.slug),
    blurb: String(r.blurb ?? ""),
    tags: (r.tags as string[] | undefined) ?? [],
    duration: r.duration != null ? String(r.duration) : undefined,
    dsUp: r.dsUp != null ? String(r.dsUp) : undefined,
    morphDs: typeof r.morphDs === "number" ? r.morphDs : undefined,
    cleanDs: r.cleanDs != null ? String(r.cleanDs) : undefined,
    ...fx,
  };
}

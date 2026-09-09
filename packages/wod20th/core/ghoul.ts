// core/ghoul.ts -- Ghoul lifecycle: vitae dependency, disciplines, cutoff.

import type { IWoDChar } from "./types.ts";
import { isKindred } from "./kindred.ts";

/** Default days a ghoul can go without vitae before withdrawal. */
export const GHOUL_VITAE_DAYS = 30;
export const GHOUL_VITAE_MS = GHOUL_VITAE_DAYS * 24 * 60 * 60 * 1000;

/** Max Discipline dots a ghoul may hold (V20: typically 1, some 2). */
export const GHOUL_DISC_MAX = 1;

export function isGhoul(char: IWoDChar): boolean {
  return char.isGhoul === true && !isKindred(char);
}

export interface IGhoulStatus {
  isGhoul: boolean;
  domitorId?: string;
  bloodPool: number;
  bloodMax: number;
  lastFedAt?: number;
  daysSinceFed: number | null;
  inWithdrawal: boolean;
  disciplines: Record<string, number>;
}

export function ghoulStatus(
  char: IWoDChar,
  now = Date.now(),
): IGhoulStatus {
  if (!isGhoul(char)) {
    return {
      isGhoul: false,
      bloodPool: 0,
      bloodMax: 0,
      daysSinceFed: null,
      inWithdrawal: false,
      disciplines: {},
    };
  }
  const last = char.ghoulLastFedAt;
  const daysSinceFed = last !== undefined
    ? Math.floor((now - last) / (24 * 60 * 60 * 1000))
    : null;
  const inWithdrawal = last === undefined
    ? false
    : now - last > GHOUL_VITAE_MS;
  return {
    isGhoul: true,
    domitorId: char.domitorId,
    bloodPool: char.bloodPool ?? 0,
    bloodMax: char.bloodMax ?? 2,
    lastFedAt: last,
    daysSinceFed,
    inWithdrawal,
    disciplines: { ...(char.ghoulDisciplines ?? {}) },
  };
}

/** Domitor feeds the ghoul 1 BP of vitae -- refreshes dependency clock. */
export function feedGhoulVitae(
  domitor: IWoDChar,
  ghoul: IWoDChar,
  amount = 1,
): { ok: boolean; message: string } {
  if (!isKindred(domitor)) {
    return { ok: false, message: "Only Kindred can maintain a ghoul." };
  }
  if (!isGhoul(ghoul)) {
    return { ok: false, message: "Target is not a ghoul." };
  }
  if (ghoul.domitorId && ghoul.domitorId !== domitor.id) {
    return {
      ok: false,
      message: "That ghoul belongs to another domitor.",
    };
  }
  const n = Math.max(1, Math.floor(amount));
  const cur = domitor.bloodPool ?? 0;
  if (cur < n) {
    return {
      ok: false,
      message: `Need ${n} Blood (have ${cur}/${domitor.bloodMax}).`,
    };
  }
  domitor.bloodPool = cur - n;
  const gMax = ghoul.bloodMax ?? 2;
  ghoul.bloodPool = Math.min(gMax, (ghoul.bloodPool ?? 0) + n);
  ghoul.ghoulLastFedAt = Date.now();
  ghoul.domitorId = domitor.id;
  // Vitae drink deepens bond one step if below 3.
  const bonds = { ...(ghoul.bonds ?? {}) };
  const lvl = bonds[domitor.id] ?? 0;
  if (lvl < 3) bonds[domitor.id] = lvl + 1;
  ghoul.bonds = bonds;
  return {
    ok: true,
    message:
      `Fed ${n} vitae to ghoul. Ghoul BP ` +
      `${ghoul.bloodPool}/${gMax}; dependency clock reset. ` +
      `Bond ${bonds[domitor.id]}/3.`,
  };
}

/**
 * Teach/set a ghoul Discipline at 1 dot (staff or domitor).
 * Ghouls cannot exceed GHOUL_DISC_MAX per Discipline.
 */
export function setGhoulDiscipline(
  ghoul: IWoDChar,
  name: string,
  dots: number,
): { ok: boolean; message: string } {
  if (!isGhoul(ghoul)) {
    return { ok: false, message: "Target is not a ghoul." };
  }
  const n = Math.floor(dots);
  if (n < 0 || n > GHOUL_DISC_MAX) {
    return {
      ok: false,
      message: `Ghoul Disciplines are 0-${GHOUL_DISC_MAX} dots.`,
    };
  }
  const key = name.trim();
  if (!key) return { ok: false, message: "Discipline name required." };
  const discs = { ...(ghoul.ghoulDisciplines ?? {}) };
  if (n === 0) {
    delete discs[key];
  } else {
    discs[key] = n;
  }
  ghoul.ghoulDisciplines = Object.keys(discs).length ? discs : undefined;
  return {
    ok: true,
    message: n === 0
      ? `Removed ghoul Discipline ${key}.`
      : `Ghoul ${key} set to ${n}.`,
  };
}

/**
 * Cut off from vitae: after GHOUL_VITAE_DAYS, lose Disciplines and
 * begin aging (narrative flag). Staff may call forceWithdrawal earlier.
 */
export function applyGhoulWithdrawal(
  ghoul: IWoDChar,
  force = false,
  now = Date.now(),
): { ok: boolean; message: string; withdrew: boolean } {
  if (!isGhoul(ghoul)) {
    return { ok: false, message: "Not a ghoul.", withdrew: false };
  }
  const st = ghoulStatus(ghoul, now);
  if (!force && !st.inWithdrawal) {
    const daysLeft = st.lastFedAt
      ? Math.max(
        0,
        GHOUL_VITAE_DAYS -
          Math.floor((now - st.lastFedAt) / (24 * 60 * 60 * 1000)),
      )
      : GHOUL_VITAE_DAYS;
    return {
      ok: true,
      withdrew: false,
      message:
        `Still maintained (${daysLeft} day(s) until withdrawal).`,
    };
  }
  ghoul.ghoulDisciplines = undefined;
  ghoul.bloodPool = 0;
  ghoul.powerFlags = {
    ...(ghoul.powerFlags ?? {}),
    ghoulWithdrawing: true,
    ghoulAging: true,
  };
  return {
    ok: true,
    withdrew: true,
    message:
      "Withdrawal: Disciplines lost, vitae gone. " +
      "Aging resumes -- without vitae the ghoul will die of age " +
      "or become mortal again (ST).",
  };
}

/** Sever ghoul state entirely (become mortal again). */
export function ungoul(
  ghoul: IWoDChar,
): { ok: boolean; message: string } {
  if (!isGhoul(ghoul)) {
    return { ok: false, message: "Not a ghoul." };
  }
  ghoul.isGhoul = undefined;
  ghoul.domitorId = undefined;
  ghoul.bloodMax = undefined;
  ghoul.bloodPool = undefined;
  ghoul.bloodPerTurn = undefined;
  ghoul.ghoulLastFedAt = undefined;
  ghoul.ghoulDisciplines = undefined;
  if (ghoul.powerFlags) {
    const f = { ...ghoul.powerFlags };
    delete f.ghoulWithdrawing;
    delete f.ghoulAging;
    ghoul.powerFlags = Object.keys(f).length ? f : undefined;
  }
  return { ok: true, message: "Ghoul state cleared; mortal again." };
}

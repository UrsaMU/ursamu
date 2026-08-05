/**
 * Calendar math for +time - moon, season, period, sun (London-like).
 * Pure helpers; engine GameClock is 12 months × 28 days.
 */

export type GameDate = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

export const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

export const WEEKDAY_NAMES = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

export type Season = "winter" | "spring" | "summer" | "autumn";

export type MoonPhase = {
  name: string;
  /** 0-1 approximate illumination. */
  illum: number;
  slug: string;
};

export type DayPeriod = {
  name: string;
  slug: string;
};

/** Day-of-year index 0..335 (12×28). */
export function dayOfYear(month: number, day: number): number {
  const m = clamp(month, 1, 12);
  const d = clamp(day, 1, 28);
  return (m - 1) * 28 + (d - 1);
}

export function weekdayName(month: number, day: number): string {
  const i = dayOfYear(month, day) % 7;
  return WEEKDAY_NAMES[i]!;
}

export function monthName(month: number): string {
  return MONTH_NAMES[clamp(month, 1, 12) - 1]!;
}

/** 1 → 1st, 2 → 2nd, 3 → 3rd, 4 → 4th, … */
export function ordinalDay(day: number): string {
  const d = clamp(day, 1, 28);
  const mod10 = d % 10;
  const mod100 = d % 100;
  if (mod10 === 1 && mod100 !== 11) return `${d}st`;
  if (mod10 === 2 && mod100 !== 12) return `${d}nd`;
  if (mod10 === 3 && mod100 !== 13) return `${d}rd`;
  return `${d}th`;
}

export function seasonOf(month: number): Season {
  const m = clamp(month, 1, 12);
  if (m === 12 || m <= 2) return "winter";
  if (m <= 5) return "spring";
  if (m <= 8) return "summer";
  return "autumn";
}

export function seasonLabel(month: number): string {
  const s = seasonOf(month);
  const m = clamp(month, 1, 12);
  if (s === "winter") {
    if (m === 12) return "Early winter";
    if (m === 1) return "Midwinter";
    return "Late winter";
  }
  if (s === "spring") {
    if (m === 3) return "Early spring";
    if (m === 4) return "High spring";
    return "Late spring";
  }
  if (s === "summer") {
    if (m === 6) return "Early summer";
    if (m === 7) return "High summer";
    return "Late summer";
  }
  if (m === 9) return "Early autumn";
  if (m === 10) return "Mid-autumn";
  return "Late autumn";
}

/** CtL seasonal court in power for this month. */
export function courtInPower(month: number): string {
  const s = seasonOf(month);
  if (s === "winter") return "Winter Court";
  if (s === "spring") return "Spring Court";
  if (s === "summer") return "Summer Court";
  return "Autumn Court";
}

/**
 * Moon from day-of-month (28-day months = one full lunation).
 * Day 1 ≈ new, day 15 ≈ full.
 */
export function moonPhase(day: number): MoonPhase {
  const d = clamp(day, 1, 28);
  const ang = ((d - 1) / 28) * Math.PI * 2;
  const illum = (1 - Math.cos(ang)) / 2;

  if (d <= 2) {
    return { name: "New Moon", illum, slug: "new" };
  }
  if (d <= 6) {
    return { name: "Waxing Crescent", illum, slug: "waxing-crescent" };
  }
  if (d <= 9) {
    return { name: "First Quarter", illum, slug: "first-quarter" };
  }
  if (d <= 13) {
    return { name: "Waxing Gibbous", illum, slug: "waxing-gibbous" };
  }
  if (d <= 16) {
    return { name: "Full Moon", illum, slug: "full" };
  }
  if (d <= 20) {
    return { name: "Waning Gibbous", illum, slug: "waning-gibbous" };
  }
  if (d <= 23) {
    return { name: "Last Quarter", illum, slug: "last-quarter" };
  }
  return { name: "Waning Crescent", illum, slug: "waning-crescent" };
}

export function dayPeriod(hour: number): DayPeriod {
  const h = clamp(hour, 0, 23);
  if (h < 5) return { name: "Dead of night", slug: "latenight" };
  if (h < 7) return { name: "Dawn", slug: "dawn" };
  if (h < 12) return { name: "Morning", slug: "morning" };
  if (h < 14) return { name: "Midday", slug: "midday" };
  if (h < 17) return { name: "Afternoon", slug: "afternoon" };
  if (h < 19) return { name: "Dusk", slug: "dusk" };
  if (h < 22) return { name: "Evening", slug: "evening" };
  return { name: "Night", slug: "night" };
}

/**
 * Approx sunrise/sunset hour for London latitude by month.
 * Values are hour + fraction (e.g. 8.25 ≈ 08:15).
 */
const SUN_TABLE: readonly { rise: number; set: number }[] = [
  { rise: 8.1, set: 16.2 }, // Jan
  { rise: 7.4, set: 17.1 }, // Feb
  { rise: 6.3, set: 18.0 }, // Mar
  { rise: 5.3, set: 18.9 }, // Apr
  { rise: 4.5, set: 19.7 }, // May
  { rise: 4.1, set: 20.3 }, // Jun
  { rise: 4.3, set: 20.2 }, // Jul
  { rise: 5.1, set: 19.4 }, // Aug
  { rise: 6.0, set: 18.2 }, // Sep
  { rise: 6.9, set: 17.1 }, // Oct
  { rise: 7.7, set: 16.2 }, // Nov
  { rise: 8.1, set: 15.8 }, // Dec
];

export function sunTimes(month: number): { rise: string; set: string } {
  const row = SUN_TABLE[clamp(month, 1, 12) - 1]!;
  return {
    rise: fracToClock(row.rise),
    set: fracToClock(row.set),
  };
}

function fracToClock(frac: number): string {
  const h = Math.floor(frac);
  const m = Math.round((frac - h) * 60) % 60;
  return formatClock(h, m);
}

/** Is the sun above the horizon (approx)? */
export function isDaylight(t: GameDate): boolean {
  const row = SUN_TABLE[clamp(t.month, 1, 12) - 1]!;
  const now = t.hour + t.minute / 60;
  return now >= row.rise && now < row.set;
}

/**
 * Rough moon-in-sky note from phase + time of day.
 * Not an ephemeris - flavor only.
 */
export function moonSkyNote(t: GameDate, moon: MoonPhase): string {
  if (moon.slug === "new") {
    return "lost in the sun's glare";
  }
  const day = isDaylight(t);
  if (moon.slug === "full") {
    return day
      ? "pale disc low in the day sky"
      : "high and white over the roofs";
  }
  if (
    moon.slug === "waxing-crescent" ||
    moon.slug === "first-quarter" ||
    moon.slug === "waxing-gibbous"
  ) {
    return day
      ? "a pale smudge if you know where to look"
      : "climbing the eastern sky after dusk";
  }
  return day
    ? "fading in the western morning light"
    : "sinking toward the western roofs";
}

/** Stable 32-bit hash for weather picks. */
export function dateSeed(
  year: number,
  month: number,
  day: number,
  bucket = 0,
): number {
  let h = (year * 374761393 + month * 668265263 + day * 1274126177 +
    bucket * 2246822519) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 2246822507) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 3266489909) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/** 24h HH:MM */
export function formatClock(hour: number, minute: number): string {
  const hh = String(clamp(hour, 0, 23)).padStart(2, "0");
  const mm = String(clamp(minute, 0, 59)).padStart(2, "0");
  return `${hh}:${mm}`;
}

/** Victorian-friendly 12h clock, e.g. 3:05 pm */
export function formatClock12(hour: number, minute: number): string {
  const h = clamp(hour, 0, 23);
  const m = clamp(minute, 0, 59);
  const ap = h >= 12 ? "pm" : "am";
  let h12 = h % 12;
  if (h12 === 0) h12 = 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ap}`;
}

export function illumLabel(illum: number): string {
  if (illum < 0.08) return "dark";
  if (illum < 0.25) return "a thin crescent";
  if (illum < 0.45) return "half-lit";
  if (illum < 0.7) return "bright";
  if (illum < 0.92) return "nearly full";
  return "blazing";
}

/** Word-wrap plain text to max visible width (no color codes). */
export function wrapText(
  text: string,
  width: number,
  indent = 0,
): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const pad = " ".repeat(Math.max(0, indent));
  const max = Math.max(8, width - indent);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if (!cur) {
      cur = w;
      continue;
    }
    if (cur.length + 1 + w.length <= max) {
      cur += ` ${w}`;
    } else {
      lines.push(pad + cur);
      cur = w;
    }
  }
  if (cur) lines.push(pad + cur);
  return lines;
}

function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.min(hi, Math.max(lo, Math.trunc(n)));
}

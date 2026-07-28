/**
 * +time - in-game clock, season, weather, moon (London-like).
 * Layout via u.util.header/divider/footer so game.layout templates apply
 * (importing header from the package hits a dual-package empty template).
 */

import type { IUrsamuSDK } from "@ursamu/ursamu";
import {
  dayPeriod,
  formatClock12,
  illumLabel,
  monthName,
  moonPhase,
  ordinalDay,
  seasonLabel,
  sunTimes,
  weekdayName,
  wrapText,
  type GameDate,
} from "../time/calendar.ts";
import { weatherFor } from "../time/weather.ts";

const WIDTH = 78;
const LABEL_W = 10;
const INDENT = 2 + LABEL_W + 1; // "  " + label + " "

function label(s: string): string {
  return `%cy${s.padEnd(LABEL_W)}%cn`;
}

/** First line with label; extra wrap lines indented under value. */
function labeled(name: string, value: string): string[] {
  const wrapped = wrapText(value, WIDTH, INDENT);
  if (!wrapped.length) return [`  ${label(name)}`];
  const first = wrapped[0]!.trimStart();
  const out = [`  ${label(name)} ${first}`];
  for (let i = 1; i < wrapped.length; i++) {
    out.push(wrapped[i]!);
  }
  return out;
}

async function loadGameDate(u: IUrsamuSDK): Promise<GameDate> {
  const gt = await u.sys.gameTime();
  return {
    year: gt.year,
    month: gt.month,
    day: gt.day,
    hour: gt.hour,
    minute: gt.minute,
  };
}

function yearLabel(year: number): string {
  // Victorian / absolute years print bare; early epochs keep "Year N".
  if (year >= 1000) return String(year);
  return `Year ${year}`;
}

function chrome(
  u: IUrsamuSDK,
  kind: "header" | "divider" | "footer",
  title = "",
): string {
  const fn = u.util[kind];
  if (typeof fn === "function") {
    return (fn as (t?: string) => string)(title);
  }
  // Fallback if util chrome missing (tests / bare SDK).
  if (kind === "footer") return "=".repeat(WIDTH);
  if (kind === "divider") {
    return title ? `- ${title} -` : "-".repeat(WIDTH);
  }
  return title ? `= ${title} =` : "=".repeat(WIDTH);
}

export async function timeExec(u: IUrsamuSDK): Promise<void> {
  let t: GameDate;
  try {
    t = await loadGameDate(u);
  } catch (e: unknown) {
    const m = e instanceof Error ? e.message : String(e);
    u.send(`%chTime:%cn Could not read game clock (${m}).`);
    return;
  }

  const period = dayPeriod(t.hour);
  const moon = moonPhase(t.day);
  const weather = weatherFor(t);
  const sun = sunTimes(t.month);

  const dateLine =
    `${weekdayName(t.month, t.day)}, ` +
    `${ordinalDay(t.day)} ${monthName(t.month)}, ` +
    `${yearLabel(t.year)}`;
  const clockLine =
    `${formatClock12(t.hour, t.minute)}  (${period.name})`;
  const seasonLine = seasonLabel(t.month);
  const moonLine =
    `${moon.name}  %ch%cx(${illumLabel(moon.illum)})%cn`;
  const sunLine = `Rises ~${sun.rise}, sets ~${sun.set}`;

  const lines: string[] = [
    chrome(u, "header", "Time"),
    ...labeled("Date", dateLine),
    ...labeled("Clock", clockLine),
    chrome(u, "divider", "Sky"),
    ...labeled("Season", seasonLine),
    ...labeled("Weather", weather),
    ...labeled("Moon", moonLine),
    ...labeled("Sun", sunLine),
    chrome(u, "footer"),
  ];
  // Use real newlines - layout chrome may be multi-line; %r is for MUSH body.
  u.send(lines.join("\n"));
}

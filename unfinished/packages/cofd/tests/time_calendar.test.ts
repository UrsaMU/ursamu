/**
 * Pure calendar helpers + +time render smoke test.
 */
import {
  assertEquals,
  assertStringIncludes,
} from "@std/assert";
import {
  courtInPower,
  dayOfYear,
  dayPeriod,
  formatClock,
  formatClock12,
  isDaylight,
  moonPhase,
  moonSkyNote,
  ordinalDay,
  seasonLabel,
  seasonOf,
  sunTimes,
  weekdayName,
  wrapText,
} from "../src/time/calendar.ts";
import { weatherFor } from "../src/time/weather.ts";
import { timeExec } from "../src/commands/time.ts";
import { mockU, mockPlayer } from "./helpers/mockU.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("dayOfYear spans 12×28", OPTS, () => {
  assertEquals(dayOfYear(1, 1), 0);
  assertEquals(dayOfYear(1, 28), 27);
  assertEquals(dayOfYear(2, 1), 28);
  assertEquals(dayOfYear(12, 28), 335);
});

Deno.test("weekday cycles every 7 days", OPTS, () => {
  assertEquals(weekdayName(1, 1), "Monday");
  assertEquals(weekdayName(1, 2), "Tuesday");
  assertEquals(weekdayName(1, 8), "Monday");
});

Deno.test("ordinalDay", OPTS, () => {
  assertEquals(ordinalDay(1), "1st");
  assertEquals(ordinalDay(2), "2nd");
  assertEquals(ordinalDay(3), "3rd");
  assertEquals(ordinalDay(4), "4th");
  assertEquals(ordinalDay(11), "11th");
  assertEquals(ordinalDay(21), "21st");
  assertEquals(ordinalDay(22), "22nd");
  assertEquals(ordinalDay(23), "23rd");
});

Deno.test("seasonOf maps months to London seasons", OPTS, () => {
  assertEquals(seasonOf(1), "winter");
  assertEquals(seasonOf(4), "spring");
  assertEquals(seasonOf(7), "summer");
  assertEquals(seasonOf(10), "autumn");
  assertEquals(seasonOf(12), "winter");
});

Deno.test("courtInPower follows season", OPTS, () => {
  assertEquals(courtInPower(1), "Winter Court");
  assertEquals(courtInPower(4), "Spring Court");
  assertEquals(courtInPower(7), "Summer Court");
  assertEquals(courtInPower(10), "Autumn Court");
});

Deno.test("seasonLabel is descriptive", OPTS, () => {
  assertEquals(seasonLabel(1), "Midwinter");
  assertEquals(seasonLabel(7), "High summer");
  assertStringIncludes(seasonLabel(3), "spring");
});

Deno.test("moonPhase: new mid-month full", OPTS, () => {
  assertEquals(moonPhase(1).slug, "new");
  assertEquals(moonPhase(15).slug, "full");
  assertEquals(moonPhase(8).slug, "first-quarter");
  assertEquals(moonPhase(22).slug, "last-quarter");
  assertEquals(moonPhase(15).illum > moonPhase(1).illum, true);
});

Deno.test("dayPeriod covers the clock", OPTS, () => {
  assertEquals(dayPeriod(3).slug, "latenight");
  assertEquals(dayPeriod(6).slug, "dawn");
  assertEquals(dayPeriod(10).slug, "morning");
  assertEquals(dayPeriod(12).slug, "midday");
  assertEquals(dayPeriod(15).slug, "afternoon");
  assertEquals(dayPeriod(18).slug, "dusk");
  assertEquals(dayPeriod(20).slug, "evening");
  assertEquals(dayPeriod(23).slug, "night");
});

Deno.test("formatClock pads; formatClock12 is 12h", OPTS, () => {
  assertEquals(formatClock(9, 5), "09:05");
  assertEquals(formatClock(0, 0), "00:00");
  assertEquals(formatClock12(0, 5), "12:05 am");
  assertEquals(formatClock12(15, 17), "3:17 pm");
  assertEquals(formatClock12(12, 0), "12:00 pm");
});

Deno.test("sunTimes winter earlier set than summer", OPTS, () => {
  const jan = sunTimes(1);
  const jun = sunTimes(6);
  // string HH:MM - winter sunset hour < summer
  assertEquals(jan.set < jun.set, true);
  assertEquals(
    isDaylight({
      year: 1851,
      month: 6,
      day: 1,
      hour: 12,
      minute: 0,
    }),
    true,
  );
  assertEquals(
    isDaylight({
      year: 1851,
      month: 1,
      day: 1,
      hour: 22,
      minute: 0,
    }),
    false,
  );
});

Deno.test("moonSkyNote new moon", OPTS, () => {
  const note = moonSkyNote(
    { year: 1, month: 1, day: 1, hour: 22, minute: 0 },
    moonPhase(1),
  );
  assertStringIncludes(note, "sun");
});

Deno.test("weatherFor is stable for same date bucket", OPTS, () => {
  const a = weatherFor({
    year: 1,
    month: 1,
    day: 10,
    hour: 8,
    minute: 0,
  });
  const b = weatherFor({
    year: 1,
    month: 1,
    day: 10,
    hour: 9,
    minute: 30,
  });
  assertEquals(a, b);
  assertEquals(a.length > 10, true);
});

Deno.test("wrapText respects width", OPTS, () => {
  const lines = wrapText(
    "one two three four five six seven eight",
    20,
    0,
  );
  for (const line of lines) {
    assertEquals(line.length <= 20, true);
  }
  assertEquals(lines.length >= 2, true);
});

Deno.test("timeExec uses u.util layout chrome", OPTS, async () => {
  const me = mockPlayer({
    id: "p1",
    flags: new Set(["player", "connected"]),
  });
  const u = mockU({ me });
  // deno-lint-ignore no-explicit-any
  (u as any).sys = {
    gameTime: async () => ({
      year: 1851,
      month: 1,
      day: 1,
      hour: 15,
      minute: 17,
    }),
  };
  // deno-lint-ignore no-explicit-any
  (u as any).util = {
    ...(u as any).util,
    header: (t: string) => `[H:${t}]`,
    divider: (t: string) => `[D:${t}]`,
    footer: () => "[F]",
  };
  await timeExec(u as never);
  const out = (u as { _sent: string[] })._sent.join("\n");
  assertStringIncludes(out, "[H:Time]");
  assertStringIncludes(out, "[D:Sky]");
  assertStringIncludes(out, "[F]");
  assertStringIncludes(out, "1851");
  assertStringIncludes(out, "January");
  assertStringIncludes(out, "Midwinter");
  assertEquals(out.includes("Court"), false);
  assertStringIncludes(out, "pm");
  assertStringIncludes(out, "Moon");
  assertStringIncludes(out, "Weather");
  assertStringIncludes(out, "Sun");
});

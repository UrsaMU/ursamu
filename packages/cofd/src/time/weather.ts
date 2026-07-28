/**
 * London-like weather pools for +time (seeded by date bucket).
 */

import {
  dateSeed,
  dayPeriod,
  seasonOf,
  type GameDate,
  type Season,
} from "./calendar.ts";

function pick<T>(list: readonly T[], seed: number): T {
  return list[seed % list.length]!;
}

/**
 * London-like maritime weather: fog, drizzle, grey skies.
 * Seeded by date + 6-hour bucket so it can shift a few times a day.
 */
export function weatherFor(t: GameDate): string {
  const season = seasonOf(t.month);
  const period = dayPeriod(t.hour).slug;
  const bucket = Math.floor(t.hour / 6);
  const seed = dateSeed(t.year, t.month, t.day, bucket + period.length);
  return pick(weatherPool(season, period), seed);
}

function weatherPool(
  season: Season,
  period: string,
): readonly string[] {
  const night = period === "latenight" || period === "night" ||
    period === "dusk" || period === "evening";

  if (season === "winter") {
    if (night) return WINTER_NIGHT;
    return WINTER_DAY;
  }
  if (season === "spring") {
    if (night) return SPRING_NIGHT;
    return SPRING_DAY;
  }
  if (season === "summer") {
    if (night) return SUMMER_NIGHT;
    return SUMMER_DAY;
  }
  if (night) return AUTUMN_NIGHT;
  return AUTUMN_DAY;
}

const WINTER_NIGHT = [
  "A freezing fog smothers the streets; gas-lamps are yellow smudges.",
  "Sleet needles sideways on a river wind. Cobbles glaze with ice.",
  "Still, bitter cold. Breath hangs white; chimney-smoke won't rise.",
  "Wet snow melts on iron railings and soaks into wool coats.",
  "The Thames wind cuts clean through cloth. Stars hide behind haze.",
] as const;

const WINTER_DAY = [
  "A low grey ceiling of cloud; drizzle beads on every black umbrella.",
  "Thick yellow fog rolls up from the river, tasting of coal and salt.",
  "Hard frost on the rooftops; a weak sun tries to burn it off.",
  "Cold rain sheens the roads; gutters run black with soot-water.",
  "A raw easterly drives sleet under doorways and hat-brims.",
  "Pale winter light - no warmth, only damp stone and chimney reek.",
] as const;

const SPRING_NIGHT = [
  "Mild damp air; a soft rain ticks on glass and leaf.",
  "Broken cloud, a cool breeze off the water. Distant church bells.",
  "Mist pools in the alleys after a day of showers.",
] as const;

const SPRING_DAY = [
  "Showers come and go - bright one minute, grey the next.",
  "A blustery west wind; laundry snaps on lines above the courts.",
  "Cool and clear after rain; puddles hold a thin blue sky.",
  "Persistent drizzle, the kind that soaks without drama.",
  "Pale sun through high cloud; the air smells of wet brick and green.",
  "Sudden squalls chase people into doorways, then pass as quickly.",
] as const;

const SUMMER_NIGHT = [
  "Warm and close; the city holds the day's heat in the stones.",
  "A muggy stillness broken by far thunder over the estuary.",
  "Soft night air, almost gentle - rare mercy after the heat.",
] as const;

const SUMMER_DAY = [
  "Heavy, humid air under a milk-white sky. Coats feel like a mistake.",
  "Hazy sunshine; dust and pollen hang in the light between buildings.",
  "A brief warm rain steams off the pavement as soon as it falls.",
  "Overcast but mild - London's idea of a fine summer day.",
  "Thunderheads build inland while the river stays sticky and still.",
  "Bright intervals and showers; umbrellas half-open, half-shut.",
] as const;

const AUTUMN_NIGHT = [
  "A cold fog returns early; footsteps sound close and muffled.",
  "Wet leaves plaster the walk. Rain whispers on slate roofs.",
  "Clear and sharp after a front - stars prick through coal-smoke.",
] as const;

const AUTUMN_DAY = [
  "Steady rain and a northwest wind; the city smells of wet wool.",
  "Amber light under broken cloud; gusts strip the plane trees bare.",
  "Fog again by afternoon, thicker near the docks and the bridges.",
  "Damp and grey, neither warm nor quite freezing - pure autumn.",
  "A hard shower scours the streets clean, then leaves a shining quiet.",
  "Cool sun and long shadows; chimney smoke leans with the breeze.",
] as const;

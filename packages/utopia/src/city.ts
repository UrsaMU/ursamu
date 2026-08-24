import { pickStory } from "./catalog.ts";
import type { ICity, IStory } from "./types.ts";

export const CITY_ID = "city";
export const DEFAULT_CITY = "New Cascadia";

export function defaultCity(name = DEFAULT_CITY): ICity {
  return {
    id: CITY_ID,
    name,
    week: 1,
    tension: {
      id: "weeds",
      title: "Stack-weeds in the grates",
      severity: 2,
      ongoing: true,
    },
    stories: [],
  };
}

function clampSev(n: number, min: number): number {
  return Math.max(min, Math.min(6, n));
}

function bump(s: IStory, d: number, min: number): IStory {
  return { ...s, severity: clampSev(s.severity + d, min) };
}

export function tickFeed(
  city: ICity,
  rng: () => number,
): { city: ICity; dangerDelta: number } {
  const roll = Math.min(10, Math.max(1, Math.floor(rng() * 10) + 1));
  let tension = city.tension;
  let stories = city.stories.map((s) => ({ ...s }));
  let dangerDelta = 0;
  const s0 = stories[0];
  const s1 = stories[1];

  if (roll === 1) {
    tension = bump(tension, 2, 1);
    stories = stories.map((s) => bump(s, 2, 0));
    dangerDelta = 1;
  } else if (roll === 2) tension = bump(tension, 2, 1);
  else if (roll === 3) tension = bump(tension, 1, 1);
  else if (roll === 4) tension = bump(tension, -1, 1);
  else if (roll === 5) tension = bump(tension, -2, 1);
  else if (roll === 6 && s0) stories[0] = bump(s0, 2, 0);
  else if (roll === 7 && s0) stories[0] = bump(s0, -2, 0);
  else if (roll === 8 && s1) stories[1] = bump(s1, 2, 0);
  else if (roll === 9 && s1) stories[1] = bump(s1, -2, 0);
  else if (roll === 10) dangerDelta = -1;

  stories = stories.filter((s) => s.severity > 0);
  const used = new Set([
    tension.id,
    ...stories.map((s) => s.id),
  ]);
  if (stories.length < 2) {
    const next = pickStory(used, rng);
    if (next) stories.push(next);
  }
  return {
    city: {
      ...city,
      week: city.week + 1,
      tension,
      stories,
    },
    dangerDelta,
  };
}

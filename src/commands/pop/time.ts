/**
 * Price of Power: +time / +settime
 *
 * +time              — display current season, year, moon phase, weather
 * +settime/season X  — set season (staff)
 * +settime/year X    — set year, e.g. "508 BCE" or "42 CE" (staff)
 * +settime/weather X — set weather text, or "random" to re-enable pool (staff)
 */

import { addCmd } from "../../services/commands/index.ts";
import { dbojs } from "../../services/Database/index.ts";
import { send } from "../../services/broadcast/index.ts";

// ============================================================================
// CONSTANTS
// ============================================================================

const VALID_SEASONS = ["Winter", "Spring", "Summer", "Autumn"];

const DEFAULT_WEATHER: Record<string, string[]> = {
  Winter: [
    "A bitter tramontane wind sweeps down from the Apennines, cutting through wool and leather alike.",
    "Cold rain lashes the seven hills, turning the unpaved roads into rivers of mud.",
    "Heavy grey clouds hang low over the Tiber, swallowing the hilltops in mist.",
    "Frost clings to the terra-cotta rooftops, glittering under pale moonlight.",
    "A damp chill rises from the river marshes, settling deep into the bones.",
    "Sleet rattles against the wooden shutters of the insulae as the wind howls between buildings.",
    "The Tiber runs high and brown with winter rains, lapping at the edges of the Forum Boarium.",
    "A rare dusting of snow covers the Capitoline, muffling the city in an eerie silence.",
    "Woodsmoke hangs thick in the narrow streets, mingling with the smell of wet stone.",
    "Icy gusts roll across the Campus Martius, scattering dead leaves before them.",
  ],
  Spring: [
    "Warm breezes carry the scent of wildflowers down from the Alban Hills.",
    "A gentle rain patters against limestone and packed earth, coaxing green shoots from the soil.",
    "The air hums with the sound of bees among the olive groves outside the city walls.",
    "Puddles of rainwater catch the last light of dusk along the Via Sacra.",
    "A soft south wind stirs the surface of the Tiber, carrying the smell of turned earth.",
    "Swallows dart and wheel above the rooftops as the evening sky deepens to violet.",
    "The hills are alive with the green of new growth, poppies blazing red among the grass.",
    "Thunder rumbles beyond the Janiculum, but the rain has not yet come.",
    "A light mist clings to the riverbanks at dawn, burning off as the sun climbs.",
    "The air is sweet with blossoming laurel and the distant bleating of lambs.",
  ],
  Summer: [
    "The heat of the day lingers long into the evening, thick and oppressive over the seven hills.",
    "Cicadas drone endlessly in the dry, amber grass beyond the city gates.",
    "A hot wind stirs dust along the roads, coating travellers and merchants alike.",
    "Stars burn fiercely in the cloudless night sky above the Capitoline.",
    "The stench of the marshes grows unbearable in the still, heavy air.",
    "Heat shimmers rise from the sun-baked stones of the Forum, distorting the distance.",
    "Not a breath of wind stirs; the Tiber lies flat and sluggish under the relentless sun.",
    "Dry lightning flickers on the horizon beyond the Alban Hills, but no rain falls.",
    "The shade of the sacred groves offers the only respite from the punishing heat.",
    "Dust devils spin lazily across the Campus Martius in the scorching afternoon light.",
  ],
  Autumn: [
    "Leaves of gold and russet drift from the plane trees along the Tiber.",
    "A crisp wind carries the earthy smell of the grape harvest down from the hillside vineyards.",
    "Mist clings to the river valleys as the evening cools, shrouding the low ground.",
    "The sky is a bruised purple over the western hills, the last light fading fast.",
    "A steady rain drums on the tile roofs, filling the gutters with rushing water.",
    "The smell of pressed olives and fermenting wine drifts through the narrow streets.",
    "Flocks of starlings wheel in vast, shifting clouds above the Palatine at dusk.",
    "Cool air rolls down from the Apennines, a welcome relief after the long summer.",
    "Wood fires crackle to life across the city as the nights grow longer and colder.",
    "A thick fog rises from the Tiber at dawn, swallowing the bridges and the Forum whole.",
  ],
};

// Moon phase calculation
const LUNAR_CYCLE_DAYS = 29.53;
const NEW_MOON_EPOCH = 1738151760000; // Jan 29 2025 12:36 UTC in ms
const MOON_PHASES = [
  "New Moon", "Waxing Crescent", "First Quarter", "Waxing Gibbous",
  "Full Moon", "Waning Gibbous", "Last Quarter", "Waning Crescent",
];

function getMoonPhase(): string {
  const daysElapsed = (Date.now() - NEW_MOON_EPOCH) / 86400000;
  const position = ((daysElapsed % LUNAR_CYCLE_DAYS) + LUNAR_CYCLE_DAYS) % LUNAR_CYCLE_DAYS / LUNAR_CYCLE_DAYS;
  const index = Math.floor(position * 8) % 8;
  return MOON_PHASES[index];
}

const WEATHER_ROTATION_MS = 86400000; // 24 hours
const WORLD_STATE_KEY = "world_state";

// ============================================================================
// WORLD STATE HELPERS
// ============================================================================

interface WorldState {
  season: string;
  year: number;
  weather: string;
  weather_override: boolean;
  weather_set_at: number;
}

async function getWorldState(): Promise<WorldState> {
  const entry = await dbojs.queryOne({ id: WORLD_STATE_KEY });
  if (entry?.data) {
    return {
      season: entry.data.season as string || "Spring",
      year: (entry.data.year as number) ?? -508,
      weather: entry.data.weather as string || "",
      weather_override: entry.data.weather_override as boolean || false,
      weather_set_at: entry.data.weather_set_at as number || 0,
    };
  }
  // Create default
  const defaults: WorldState = {
    season: "Spring",
    year: -508,
    weather: "",
    weather_override: false,
    weather_set_at: 0,
  };
  await dbojs.create({
    id: WORLD_STATE_KEY,
    flags: "system",
    data: { ...defaults, name: "World State" },
    location: "",
  });
  return defaults;
}

async function setWorldState(updates: Partial<WorldState>) {
  const updateObj: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(updates)) {
    updateObj[`data.${k}`] = v;
  }
  await dbojs.modify({ id: WORLD_STATE_KEY }, "$set", updateObj as any);
}

function getWeather(ws: WorldState): string {
  if (ws.weather_override && ws.weather) return ws.weather;
  const elapsed = Date.now() - (ws.weather_set_at || 0);
  if (!ws.weather || elapsed >= WEATHER_ROTATION_MS) {
    const pool = DEFAULT_WEATHER[ws.season] || DEFAULT_WEATHER["Spring"];
    const picked = pool[Math.floor(Math.random() * pool.length)];
    // Fire and forget -- update async
    setWorldState({ weather: picked, weather_set_at: Date.now() });
    return picked;
  }
  return ws.weather;
}

export function getGameYear(): Promise<number> {
  return getWorldState().then(ws => ws.year);
}

function formatYear(year: number): string {
  return year < 0 ? `${Math.abs(year)} BCE` : `${year} CE`;
}

function wordWrap(text: string, width: number): string {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "   ";
  for (const word of words) {
    if (line.length + word.length + 1 > width && line.trim().length > 0) {
      lines.push(line);
      line = "   " + word;
    } else {
      line += (line.trim().length > 0 ? " " : "") + word;
    }
  }
  if (line.trim().length > 0) lines.push(line);
  return lines.join("\n");
}

// ============================================================================
// COMMANDS
// ============================================================================

export default () => {
  // +time
  addCmd({
    name: "+time",
    pattern: /^\+time$/i,
    lock: "connected",
    exec: async (u) => {
      const sid = u.socketId || "";
      const ws = await getWorldState();
      const weather = getWeather(ws);
      const moon = getMoonPhase();
      const yearDisplay = formatYear(ws.year);

      const seasonColors: Record<string, string> = {
        Winter: "%cb",
        Spring: "%cy",
        Summer: "%ch%cy",
        Autumn: "%cm",
      };
      const sc = seasonColors[ws.season] || "%cw";

      const sep = "=".repeat(77);
      const thin = "-".repeat(77);

      const line1Text = "==> Actual daytime is setters choice. <==";
      const line2Text = "==> Most scenes should be set between around sundown and midnight <==";
      const pad1 = " ".repeat(Math.max(0, Math.floor((77 - line1Text.length) / 2)));
      const pad2 = " ".repeat(Math.max(0, Math.floor((77 - line2Text.length) / 2)));

      const msg = [
        `${sep}`,
        `${pad1}%cy==>%cn Actual daytime is setters choice. %cy<==%cn`,
        `${pad2}%cy==>%cn Most scenes should be set between around sundown and midnight %cy<==%cn`,
        `${thin}`,
        ``,
        ` It is ${sc}${ws.season}%cn in the year %ch${yearDisplay}%cn.`,
        ` The moon is currently a %ch${moon}%cn.`,
        ``,
        ` %chCurrent Weather:%cn`,
        ``,
        wordWrap(weather, 74),
        ``,
        `${sep}`,
      ].join("\n");

      send([sid], msg);
    },
  });

  // +settime/season, +settime/year, +settime/weather
  addCmd({
    name: "+settime",
    pattern: /^\+settime\/(\w+)\s*(.*)?$/i,
    lock: "connected & superuser",
    exec: async (u) => {
      const sid = u.socketId || "";
      const switchName = (u.cmd.args[0] || "").toLowerCase();
      const value = (u.cmd.args[1] || "").trim();

      if (!switchName) {
        send([sid], "Usage: +settime/season <season> | +settime/year <num> | +settime/weather <text|random>");
        return;
      }

      if (switchName === "season") {
        const season = value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
        if (!VALID_SEASONS.includes(season)) {
          send([sid], `%crInvalid season.%cn Choose from: ${VALID_SEASONS.join(", ")}`);
          return;
        }
        const pool = DEFAULT_WEATHER[season] || DEFAULT_WEATHER["Spring"];
        const newWeather = pool[Math.floor(Math.random() * pool.length)];
        await setWorldState({ season, weather: newWeather, weather_set_at: Date.now(), weather_override: false });
        send([sid], `%cgSeason set to ${season}.%cn`);

      } else if (switchName === "year") {
        if (!value) {
          send([sid], "%crUsage: +settime/year <number> BCE|CE%cn");
          return;
        }
        const raw = value.toUpperCase();
        let multiplier = -1; // default BCE
        let numStr = raw;

        if (raw.endsWith("BCE") || raw.endsWith("BC")) {
          numStr = raw.replace(/\s*(BCE|BC)$/, "").trim();
          multiplier = -1;
        } else if (raw.endsWith("CE") || raw.endsWith("AD")) {
          numStr = raw.replace(/\s*(CE|AD)$/, "").trim();
          multiplier = 1;
        }

        const num = parseInt(numStr);
        if (isNaN(num) || num <= 0) {
          send([sid], "%crYear must be a positive number, e.g. 508 BCE or 42 CE.%cn");
          return;
        }
        const yearVal = num * multiplier;
        await setWorldState({ year: yearVal });
        send([sid], `%cgYear set to ${formatYear(yearVal)}.%cn`);

      } else if (switchName === "weather") {
        if (!value) {
          send([sid], "%crProvide weather text, or 'random' to clear the override.%cn");
          return;
        }
        if (value.toLowerCase() === "random") {
          await setWorldState({ weather_override: false, weather: "" });
          send([sid], "%cgWeather override cleared. Random weather restored.%cn");
        } else {
          await setWorldState({ weather: value, weather_override: true });
          send([sid], `%cgWeather set to:%cn ${value}`);
        }

      } else {
        send([sid], "Unknown switch. Use /season, /year, or /weather.");
      }
    },
  });
};

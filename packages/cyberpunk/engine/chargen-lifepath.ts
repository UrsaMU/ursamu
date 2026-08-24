/**
 * Pure lifepath roll patches (shared by +chargen and HTTP).
 */
import type {
  ChargenStage,
  ILifepath,
  ILifepathEnemy,
  Role,
} from "../db/schemas.ts";
import {
  CULTURAL_TABLE,
  PERSONALITY_TABLE,
  LIFE_GOAL_TABLE,
  VALUES_TABLE,
  FAMILY_TABLE,
  FAMILY_CRISIS_TABLE,
  FRIEND_TABLE,
  ENEMY_WHO_TABLE,
  ENEMY_CAUSE_TABLE,
  ENEMY_RESOURCES_TABLE,
  LIFE_EVENTS_TABLE,
  ROLE_EVENTS,
} from "../commands/chargen-lifepath-data.ts";
import { d10, LIFEPATH_STAGES, STAGE_ALIAS } from "./chargen-constants.ts";

export type LifepathRollResult = {
  roll: number;
  rolls?: number[];
  patch: Partial<ILifepath>;
  summary: Record<string, string | number | string[]>;
};

export function resolveLifepathStage(
  raw: string,
  current: ChargenStage | null | undefined,
): ChargenStage | null {
  const key = raw.toLowerCase().trim();
  if (!key && current && LIFEPATH_STAGES.has(current)) return current;
  if (STAGE_ALIAS[key]) return STAGE_ALIAS[key]!;
  if (LIFEPATH_STAGES.has(key as ChargenStage)) {
    return key as ChargenStage;
  }
  if (current && LIFEPATH_STAGES.has(current)) return current;
  return null;
}

function rollCultural(n: number): LifepathRollResult {
  const [region, langs] = CULTURAL_TABLE[n] ?? ["", ""];
  const language = (langs.split(",")[0] ?? "").trim();
  return {
    roll: n,
    patch: { culturalOrigin: region, language },
    summary: { region, language, languages: langs },
  };
}

function rollPersonality(n: number): LifepathRollResult {
  const [personality, clothingStyle, hairstyle] =
    PERSONALITY_TABLE[n] ?? ["", "", ""];
  return {
    roll: n,
    patch: { personality, clothingStyle, hairstyle },
    summary: { personality, clothingStyle, hairstyle },
  };
}

function rollMotivations(n: number): LifepathRollResult {
  const [lifeGoal, feelingAboutPeople] =
    LIFE_GOAL_TABLE[n] ?? ["", ""];
  const n2 = d10();
  const [mostValuableThing, mostValuablePerson, whatYouValue] =
    VALUES_TABLE[n2] ?? ["", "", ""];
  return {
    roll: n,
    rolls: [n, n2],
    patch: {
      lifeGoal,
      feelingAboutPeople,
      mostValuableThing,
      mostValuablePerson,
      whatYouValue,
    },
    summary: {
      lifeGoal,
      feelingAboutPeople,
      mostValuableThing,
      mostValuablePerson,
      whatYouValue,
    },
  };
}

function rollFamily(
  n: number,
  crisis: boolean,
): LifepathRollResult {
  if (crisis) {
    const familyCrisis = FAMILY_CRISIS_TABLE[n] ?? "";
    return {
      roll: n,
      patch: { familyCrisis },
      summary: { familyCrisis },
    };
  }
  const [familyBackground, childhoodEnvironment] =
    FAMILY_TABLE[n] ?? ["", ""];
  return {
    roll: n,
    patch: { familyBackground, childhoodEnvironment },
    summary: { familyBackground, childhoodEnvironment },
  };
}

function rollFriend(n: number): LifepathRollResult {
  const friendHow = FRIEND_TABLE[n] ?? "";
  return {
    roll: n,
    patch: { friendHow },
    summary: { friendHow },
  };
}

function rollEnemy(n: number): LifepathRollResult {
  const who = ENEMY_WHO_TABLE[n] ?? "";
  const causeN = d10();
  const resourceN = d10();
  const cause = ENEMY_CAUSE_TABLE[causeN] ?? "";
  const resources = ENEMY_RESOURCES_TABLE[resourceN] ?? "";
  const entry: ILifepathEnemy = {
    description: who,
    causeOfEnmity: cause,
    whatTheyHave: resources,
    numPeople: 1,
  };
  return {
    roll: n,
    rolls: [n, causeN, resourceN],
    patch: { enemies: [entry] },
    summary: {
      who,
      cause,
      resources,
    },
  };
}

function rollEvent(n: number): LifepathRollResult {
  const event = LIFE_EVENTS_TABLE[n] ?? "";
  return {
    roll: n,
    patch: { lifeEvents: [event] },
    summary: { event },
  };
}

function rollRoleEvent(n: number, role: Role): LifepathRollResult {
  const table = ROLE_EVENTS[role] ?? ROLE_EVENTS.solo ?? [];
  const event = table[n] ?? "";
  return {
    roll: n,
    patch: { roleEvents: [event] },
    summary: { event },
  };
}

/** Single-entry roll for a lifepath stage. */
export function rollLifepathEntry(
  stage: ChargenStage,
  n: number,
  role: Role,
  familyCrisis = false,
): LifepathRollResult {
  switch (stage) {
    case "lifepath_cultural":
      return rollCultural(n);
    case "lifepath_personality":
      return rollPersonality(n);
    case "lifepath_motivations":
      return rollMotivations(n);
    case "lifepath_family":
      return rollFamily(n, familyCrisis);
    case "lifepath_friends":
      return rollFriend(n);
    case "lifepath_enemies":
      return rollEnemy(n);
    case "lifepath_events":
      return rollEvent(n);
    case "lifepath_role":
      return rollRoleEvent(n, role);
    default:
      return { roll: n, patch: {}, summary: {} };
  }
}

/** Merge a lifepath patch into existing lifepath (arrays append). */
export function mergeLifepath(
  current: ILifepath,
  patch: Partial<ILifepath>,
): ILifepath {
  const next: ILifepath = { ...current };
  for (const [k, v] of Object.entries(patch)) {
    const key = k as keyof ILifepath;
    if (Array.isArray(v)) {
      const prev = next[key];
      // deno-lint-ignore no-explicit-any
      (next as any)[key] = Array.isArray(prev)
        ? [...prev, ...v]
        : v;
    } else {
      // deno-lint-ignore no-explicit-any
      (next as any)[key] = v;
    }
  }
  return next;
}

/** Friends bundle: count = max(0, 1d10-7), each rolled. */
export function rollFriendsBundle(): {
  count: number;
  friends: string[];
  patch: Partial<ILifepath>;
} {
  const count = Math.max(0, d10() - 7);
  const friends: string[] = [];
  for (let i = 0; i < count; i++) {
    const r = rollFriend(d10());
    friends.push(String(r.patch.friendHow ?? ""));
  }
  return {
    count,
    friends,
    patch: { friends, _friendCount: count },
  };
}

/** Enemies bundle: count = max(0, 1d10-7). */
export function rollEnemiesBundle(): {
  count: number;
  enemies: ILifepathEnemy[];
  patch: Partial<ILifepath>;
} {
  const count = Math.max(0, d10() - 7);
  const enemies: ILifepathEnemy[] = [];
  for (let i = 0; i < count; i++) {
    const r = rollEnemy(d10());
    const e = (r.patch.enemies ?? [])[0];
    if (e) enemies.push(e);
  }
  return {
    count,
    enemies,
    patch: { enemies, _enemyCount: count },
  };
}

/** Catalog rows for UI pick lists (1-indexed tables). */
export function lifepathTableRows(
  stage: ChargenStage,
  role: Role = "solo",
  opts: { crisis?: boolean } = {},
): Array<{ n: number; label: string; detail?: string }> {
  const rows: Array<{ n: number; label: string; detail?: string }> =
    [];
  const push = (n: number, label: string, detail?: string) => {
    rows.push({ n, label, detail });
  };
  switch (stage) {
    case "lifepath_cultural":
      for (let n = 1; n <= 10; n++) {
        const [region, langs] = CULTURAL_TABLE[n] ?? ["", ""];
        push(n, region, langs);
      }
      break;
    case "lifepath_personality":
      for (let n = 1; n <= 10; n++) {
        const [p, style, hair] =
          PERSONALITY_TABLE[n] ?? ["", "", ""];
        push(n, p, `${style} · ${hair}`);
      }
      break;
    case "lifepath_motivations":
      for (let n = 1; n <= 10; n++) {
        const [goal, feel] = LIFE_GOAL_TABLE[n] ?? ["", ""];
        push(n, goal, feel);
      }
      break;
    case "lifepath_family":
      if (opts.crisis) {
        for (let n = 1; n <= 10; n++) {
          push(n, FAMILY_CRISIS_TABLE[n] ?? "");
        }
      } else {
        for (let n = 1; n <= 10; n++) {
          const [bg, env] = FAMILY_TABLE[n] ?? ["", ""];
          push(n, bg, env);
        }
      }
      break;
    case "lifepath_friends":
      for (let n = 1; n <= 10; n++) {
        push(n, FRIEND_TABLE[n] ?? "");
      }
      break;
    case "lifepath_enemies":
      for (let n = 1; n <= 10; n++) {
        push(n, ENEMY_WHO_TABLE[n] ?? "", ENEMY_CAUSE_TABLE[n]);
      }
      break;
    case "lifepath_events":
      for (let n = 1; n <= 10; n++) {
        push(n, LIFE_EVENTS_TABLE[n] ?? "");
      }
      break;
    case "lifepath_role": {
      const table = ROLE_EVENTS[role] ?? ROLE_EVENTS.solo ?? [];
      for (let n = 1; n <= 6; n++) {
        push(n, table[n] ?? "");
      }
      break;
    }
    default:
      break;
  }
  return rows.filter((r) => r.label);
}

/**
 * D&D 5e death saves, damage-at-0, massive damage.
 */
import type { DndSheet } from "./dnd_sheet.ts";

export type DeathState = {
  successes: number;
  failures: number;
  stable: boolean;
  dead: boolean;
};

export function defaultDeath(): DeathState {
  return {
    successes: 0,
    failures: 0,
    stable: false,
    dead: false,
  };
}

export function deathOf(sheet: DndSheet): DeathState {
  const d = sheet.death ?? defaultDeath();
  return {
    successes: clamp03(Number(d.successes) || 0),
    failures: clamp03(Number(d.failures) || 0),
    stable: !!d.stable,
    dead: !!d.dead,
  };
}

function clamp03(n: number): number {
  return Math.max(0, Math.min(3, Math.floor(n)));
}

export function isDying(sheet: DndSheet): boolean {
  const d = deathOf(sheet);
  return sheet.hp.current <= 0 && !d.stable && !d.dead;
}

export function isUnconscious(sheet: DndSheet): boolean {
  return sheet.hp.current <= 0 && !deathOf(sheet).dead;
}

export function isDead(sheet: DndSheet): boolean {
  return deathOf(sheet).dead;
}

/** Combat / status: out of the fight. */
export function isIncapacitated(sheet: DndSheet): boolean {
  return sheet.hp.current <= 0 || deathOf(sheet).dead;
}

export type DamageResult = {
  sheet: DndSheet;
  lines: string[];
  hpLost: number;
  instantDeath: boolean;
  deathFailureAdded: number;
};

/**
 * Apply damage with temp HP, 0 HP drop, massive damage, and
 * damage-while-dying (PHB).
 */
export function applyDamage(
  sheet: DndSheet,
  amount: number,
  opts?: { critical?: boolean },
): DamageResult {
  const s = structuredClone(sheet) as DndSheet;
  const lines: string[] = [];
  let dmg = Math.max(0, Math.floor(amount));
  let hpLost = 0;
  let deathFailureAdded = 0;
  let instantDeath = false;
  const death = deathOf(s);

  if (death.dead) {
    lines.push("Already dead — no further effect.");
    s.death = death;
    return {
      sheet: s,
      lines,
      hpLost: 0,
      instantDeath,
      deathFailureAdded,
    };
  }

  if (s.hp.temp > 0 && dmg > 0) {
    const absorb = Math.min(s.hp.temp, dmg);
    s.hp.temp -= absorb;
    dmg -= absorb;
    lines.push(`Temp HP absorbs ${absorb}.`);
  }

  if (dmg <= 0) {
    s.death = death;
    return {
      sheet: s,
      lines,
      hpLost: 0,
      instantDeath,
      deathFailureAdded,
    };
  }

  // Already at 0 HP
  if (s.hp.current <= 0) {
    const fails = opts?.critical ? 2 : 1;
    death.failures = clamp03(death.failures + fails);
    death.stable = false;
    deathFailureAdded = fails;
    lines.push(
      `Damage at 0 HP: +${fails} death save failure` +
        `${fails > 1 ? "s" : ""} (${death.failures}/3).`,
    );
    if (death.failures >= 3) {
      death.dead = true;
      death.successes = 0;
      lines.push("Three failures — dead.");
    }
    s.death = death;
    return {
      sheet: s,
      lines,
      hpLost: 0,
      instantDeath,
      deathFailureAdded,
    };
  }

  const before = s.hp.current;
  const overflow = Math.max(0, dmg - before);
  s.hp.current = Math.max(0, before - dmg);
  hpLost = before - s.hp.current;

  if (s.hp.current > 0) {
    s.death = defaultDeath();
    return {
      sheet: s,
      lines,
      hpLost,
      instantDeath,
      deathFailureAdded,
    };
  }

  lines.push("Falls unconscious (0 HP).");

  if (overflow >= s.hp.max) {
    death.dead = true;
    death.failures = 3;
    death.successes = 0;
    death.stable = false;
    instantDeath = true;
    lines.push(
      `Massive damage (${overflow} leftover ≥ max HP ` +
        `${s.hp.max}) — instant death.`,
    );
  } else {
    death.successes = 0;
    death.failures = 0;
    death.stable = false;
    death.dead = false;
  }

  s.death = death;
  return { sheet: s, lines, hpLost, instantDeath, deathFailureAdded };
}

export function applyHeal(
  sheet: DndSheet,
  amount: number,
): { sheet: DndSheet; healed: number; lines: string[] } {
  const s = structuredClone(sheet) as DndSheet;
  const lines: string[] = [];
  const death = deathOf(s);

  if (death.dead) {
    lines.push("Dead — healing has no effect without raise dead.");
    s.death = death;
    return { sheet: s, healed: 0, lines };
  }

  const n = Math.max(0, Math.floor(amount));
  const before = s.hp.current;
  s.hp.current = Math.min(s.hp.max, before + n);
  const healed = s.hp.current - before;

  if (s.hp.current > 0 && before <= 0) {
    s.death = defaultDeath();
    lines.push("Regains consciousness; death saves cleared.");
  } else {
    s.death = death;
  }

  return { sheet: s, healed, lines };
}

export type DeathSaveResult = {
  sheet: DndSheet;
  roll: number;
  lines: string[];
};

export function rollDeathSave(
  sheet: DndSheet,
  rng: () => number = Math.random,
): DeathSaveResult {
  const s = structuredClone(sheet) as DndSheet;
  const death = deathOf(s);
  const lines: string[] = [];

  if (death.dead) {
    lines.push("Already dead.");
    s.death = death;
    return { sheet: s, roll: 0, lines };
  }
  if (s.hp.current > 0) {
    lines.push("Not dying — no death save needed.");
    s.death = death;
    return { sheet: s, roll: 0, lines };
  }
  if (death.stable) {
    lines.push("Already stable.");
    s.death = death;
    return { sheet: s, roll: 0, lines };
  }

  const roll = Math.floor(rng() * 20) + 1;
  lines.push(`Death save: d20(${roll}).`);

  if (roll === 1) {
    death.failures = clamp03(death.failures + 2);
    lines.push(`Natural 1 — two failures (${death.failures}/3).`);
  } else if (roll === 20) {
    s.hp.current = 1;
    s.death = defaultDeath();
    lines.push("Natural 20 — regain 1 HP and wake!");
    return { sheet: s, roll, lines };
  } else if (roll >= 10) {
    death.successes = clamp03(death.successes + 1);
    lines.push(`Success (${death.successes}/3).`);
  } else {
    death.failures = clamp03(death.failures + 1);
    lines.push(`Failure (${death.failures}/3).`);
  }

  if (death.successes >= 3) {
    death.stable = true;
    death.successes = 3;
    lines.push("Three successes — stable (still 0 HP).");
  }
  if (death.failures >= 3) {
    death.dead = true;
    death.stable = false;
    lines.push("Three failures — dead.");
  }

  s.death = death;
  return { sheet: s, roll, lines };
}

export function stabilize(
  sheet: DndSheet,
): { sheet: DndSheet; lines: string[] } {
  const s = structuredClone(sheet) as DndSheet;
  const death = deathOf(s);
  const lines: string[] = [];

  if (death.dead) {
    lines.push("Cannot stabilize the dead.");
    s.death = death;
    return { sheet: s, lines };
  }
  if (s.hp.current > 0) {
    lines.push("Not at 0 HP.");
    s.death = death;
    return { sheet: s, lines };
  }
  if (death.stable) {
    lines.push("Already stable.");
    s.death = death;
    return { sheet: s, lines };
  }

  death.stable = true;
  death.successes = 3;
  death.failures = 0;
  s.death = death;
  lines.push("Stabilized at 0 HP (unconscious).");
  return { sheet: s, lines };
}

export function formatDeathStatus(sheet: DndSheet): string {
  const d = deathOf(sheet);
  if (d.dead) return "%crDEAD%cn";
  if (sheet.hp.current > 0) return "%cgconscious%cn";
  if (d.stable) return "%cySTABLE%cn at 0 HP";
  return (
    `%crDYING%cn ${d.successes}/3 ok, ${d.failures}/3 fail`
  );
}

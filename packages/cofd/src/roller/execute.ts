// Executes a CoFD D10 roll with configurable n-again threshold and rote action support.

export type AgainThreshold = 10 | 9 | 8;

export interface RollOptions {
  /** n-again threshold; default 10. */
  again?: AgainThreshold;
  /** if true, failures (1-7) on the initial pool reroll once each. */
  rote?: boolean;
}

export interface RollResult {
  successes: number;
  /** ALL dice rolled (initial + n-again chains + rote rerolls), in order. */
  rolls: number[];
  /** Dice rolled as part of the rote second-chance reroll, separately tracked for output. */
  roteRerolls?: number[];
  exceptional: boolean;
  dramaticFailure: boolean;
  isChanceDie: boolean;
  /** Echoes the threshold used for transparency. */
  again: AgainThreshold;
  /** Echoes whether rote was applied. */
  rote: boolean;
}

function rollD10(): number {
  return Math.floor(Math.random() * 10) + 1;
}

/**
 * Performs a D10 roll according to Chronicles of Darkness rules (with optional
 * n-again threshold and rote action). Chance dice are unaffected by options.
 */
export function executeRoll(pool: number, opts: RollOptions = {}): RollResult {
  const again: AgainThreshold = opts.again ?? 10;
  const rote = opts.rote === true;

  const rolls: number[] = [];

  if (pool <= 0) {
    const die = rollD10();
    rolls.push(die);
    const isChanceSuccess = die === 10;
    const isDramaticFailure = die === 1;

    return {
      successes: isChanceSuccess ? 1 : 0,
      rolls,
      exceptional: false,
      dramaticFailure: isDramaticFailure,
      isChanceDie: true,
      // Chance dice ignore options; echo defaults for transparency.
      again: 10,
      rote: false
    };
  }

  let successes = 0;

  // Roll the initial pool, remembering which dice are "initial" so rote can
  // reroll their failures (and only theirs).
  const initialDice: number[] = [];
  for (let i = 0; i < pool; i++) {
    const die = rollD10();
    rolls.push(die);
    initialDice.push(die);
    if (die >= 8) successes++;
  }

  // Schedule n-again explosions from the initial wave.
  let diceToRoll = initialDice.filter(d => d >= again).length;

  // Process explosion waves. These dice obey the n-again threshold and chain.
  while (diceToRoll > 0) {
    const nextDiceCount = diceToRoll;
    diceToRoll = 0;
    for (let i = 0; i < nextDiceCount; i++) {
      const die = rollD10();
      rolls.push(die);
      if (die >= 8) successes++;
      if (die >= again) diceToRoll++;
    }
  }

  // Rote action: reroll each INITIAL failure once. The rerolls themselves obey
  // the n-again threshold (explosions chain) but do NOT re-trigger rote.
  let roteRerolls: number[] | undefined;
  if (rote) {
    roteRerolls = [];
    const failures = initialDice.filter(d => d < 8).length;
    let explode = 0;
    for (let i = 0; i < failures; i++) {
      const die = rollD10();
      rolls.push(die);
      roteRerolls.push(die);
      if (die >= 8) successes++;
      if (die >= again) explode++;
    }
    // n-again chains off rote rerolls.
    while (explode > 0) {
      const nextDiceCount = explode;
      explode = 0;
      for (let i = 0; i < nextDiceCount; i++) {
        const die = rollD10();
        rolls.push(die);
        if (die >= 8) successes++;
        if (die >= again) explode++;
      }
    }
  }

  return {
    successes,
    rolls,
    roteRerolls,
    exceptional: successes >= 5,
    dramaticFailure: false,
    isChanceDie: false,
    again,
    rote
  };
}

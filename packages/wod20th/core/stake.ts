// core/stake.ts -- Heart-stake paralysis (VtM simplification).

import type { IWoDChar } from "./types.ts";

/** Stake a Kindred through the heart. Blocks actions until pulled. */
export function applyStake(char: IWoDChar): {
  ok: boolean;
  message: string;
} {
  if (char.splat !== "vtm") {
    return { ok: false, message: "Only Kindred can be staked." };
  }
  if (char.staked) {
    return { ok: false, message: "Already staked." };
  }
  char.staked = true;
  return {
    ok: true,
    message: "The stake finds the heart. Paralyzed.",
  };
}

/** Remove the stake. */
export function pullStake(char: IWoDChar): {
  ok: boolean;
  message: string;
} {
  if (!char.staked) {
    return { ok: false, message: "Not staked." };
  }
  char.staked = false;
  return { ok: true, message: "The stake is pulled free." };
}

export function isStaked(char: IWoDChar): boolean {
  return char.staked === true;
}

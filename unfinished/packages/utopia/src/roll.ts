import type { IRollInput, IRollOut } from "./types.ts";

function d(sides: number, rng: () => number): number {
  const u = rng();
  const n = Math.floor(u * sides) + 1;
  if (n < 1) return 1;
  if (n > sides) return sides;
  return n;
}

export function lockDv(
  danger: number,
  rng: () => number,
): number {
  const extra = Math.max(0, danger);
  let total = d(10, rng) + d(10, rng);
  for (let i = 0; i < extra; i++) total += d(6, rng);
  return total;
}

export function resolveRoll(input: IRollInput): IRollOut {
  const rng = input.rng;
  let total = d(10, rng) + d(10, rng);
  const skill = Math.max(0, Math.min(3, input.skillDice));
  for (let i = 0; i < skill; i++) total += d(6, rng);
  const dv = input.lockedDv ??
    lockDv(input.danger, rng);
  if (total > dv) {
    return { total, dv, result: "holds", danger: input.danger };
  }
  if (input.buyHitch && input.danger <= 4) {
    return {
      total,
      dv,
      result: "hitch",
      danger: input.danger + 1,
    };
  }
  return { total, dv, result: "fails", danger: input.danger };
}

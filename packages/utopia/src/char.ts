import { lockDv } from "./roll.ts";
import type { IChar, IRollOut } from "./types.ts";

export function defaultChar(
  id: string,
  name: string,
  location: string,
): IChar {
  return {
    id,
    playerId: id,
    name,
    danger: 0,
    resources: 5,
    bravado: 0,
    lifestyle: 2,
    plan: "",
    ready: false,
    lockedDv: null,
    dangerAdded: false,
    goals: [],
    location,
    status: "approved",
    system: "utopia",
  };
}

export function setPlan(
  ch: IChar,
  raw: string,
  rng: () => number,
): IChar {
  const plan = raw.trim();
  const dv = ch.lockedDv ?? lockDv(ch.danger, rng);
  return { ...ch, plan, ready: false, lockedDv: dv };
}

export function setReady(ch: IChar): IChar {
  if (!ch.plan) return ch;
  return { ...ch, ready: true };
}

export function layLow(
  ch: IChar,
): { ok: true; char: IChar } | { ok: false; err: string } {
  if (ch.dangerAdded) {
    return { ok: false, err: "You added danger this week." };
  }
  return {
    ok: true,
    char: {
      ...ch,
      danger: Math.max(0, ch.danger - 2),
      ready: true,
    },
  };
}

export function applyRuling(ch: IChar, roll: IRollOut): IChar {
  const added = roll.danger > ch.danger;
  return {
    ...ch,
    danger: roll.danger,
    lockedDv: roll.dv,
    dangerAdded: ch.dangerAdded || added,
    ready: true,
  };
}

export function recover(ch: IChar): IChar {
  return { ...ch, ready: true };
}

export function crewAllReady(crew: IChar[]): boolean {
  return crew.length > 0 && crew.every((c) => c.ready && !!c.plan);
}

export function takeJob(ch: IChar, title: string): IChar {
  const goals = [...ch.goals];
  if (goals.length < 3) goals.push(title);
  else goals[2] = title;
  return { ...ch, goals, plan: title, ready: false };
}

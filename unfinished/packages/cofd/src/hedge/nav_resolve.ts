// Resolve one Hedge navigation chase turn.

import type { CofdSheet } from "../stats/sheet.ts";
import type { HedgeNavState } from "./types.ts";
import type { NavPools } from "./nav_pools.ts";

export type NavOutcomeKind =
  | "auto"
  | "success"
  | "continue"
  | "fail";

export interface NavTurnResult {
  kind: NavOutcomeKind;
  playerSuccesses: number;
  hedgeSuccesses: number;
  progress: number;
  hedgeProgress: number;
  target: number;
  turns: number;
  hedgeEdge: boolean;
  applyLost: boolean;
  message: string;
  nav?: HedgeNavState;
}

export function resolveNavTurn(
  goal: string,
  prior: HedgeNavState | null,
  pools: NavPools,
  playerSuccesses: number,
  hedgeSuccesses: number,
  now: number = Date.now(),
): NavTurnResult {
  if (pools.autoSuccess) {
    return {
      kind: "auto",
      playerSuccesses: 0,
      hedgeSuccesses: 0,
      progress: pools.target,
      hedgeProgress: 0,
      target: pools.target,
      turns: 0,
      hedgeEdge: false,
      applyLost: false,
      message: `The trod holds steady. You reach: ${goal}.`,
      nav: undefined,
    };
  }

  const turns = (prior?.turns ?? 0) + 1;
  const progress = (prior?.progress ?? 0) + playerSuccesses;
  const hedgeProgress = (prior?.hedgeProgress ?? 0) +
    hedgeSuccesses;
  const target = prior?.target ?? pools.target;

  let hedgeEdge = prior?.hedgeEdge ?? false;
  if (hedgeSuccesses > playerSuccesses) hedgeEdge = true;
  else if (playerSuccesses > hedgeSuccesses) hedgeEdge = false;

  const playerDone = progress >= target;
  const hedgeDone = hedgeProgress >= target;

  if (playerDone && !hedgeDone) {
    return finish(
      "success",
      false,
      `You find your way. Goal: ${goal} ` +
        `(${progress}/${target} vs Hedge ${hedgeProgress}).`,
      playerSuccesses,
      hedgeSuccesses,
      progress,
      hedgeProgress,
      target,
      turns,
      hedgeEdge,
    );
  }

  if (hedgeDone && !playerDone) {
    return finish(
      "fail",
      true,
      `The Hedge herds you off-path. Goal lost: ${goal}. ` +
        `You gain the Lost Condition.`,
      playerSuccesses,
      hedgeSuccesses,
      progress,
      hedgeProgress,
      target,
      turns,
      hedgeEdge,
    );
  }

  if (playerDone && hedgeDone) {
    if (progress > hedgeProgress) {
      return finish(
        "success",
        false,
        `You barely outpace the Thorns. Goal: ${goal}.`,
        playerSuccesses,
        hedgeSuccesses,
        progress,
        hedgeProgress,
        target,
        turns,
        hedgeEdge,
      );
    }
    return finish(
      "fail",
      true,
      `The Hedge claims the race. Goal lost: ${goal}. ` +
        `You gain the Lost Condition.`,
      playerSuccesses,
      hedgeSuccesses,
      progress,
      hedgeProgress,
      target,
      turns,
      hedgeEdge,
    );
  }

  const nav: HedgeNavState = {
    goal,
    progress,
    hedgeProgress,
    target,
    turns,
    hedgeEdge,
    startedAt: prior?.startedAt ?? now,
  };
  return {
    kind: "continue",
    playerSuccesses,
    hedgeSuccesses,
    progress,
    hedgeProgress,
    target,
    turns,
    hedgeEdge,
    applyLost: false,
    message:
      `Still traveling toward "${goal}": you ` +
      `${progress}/${target}, Hedge ${hedgeProgress}/` +
      `${target} (turn ${turns}). ` +
      `+hedge/travel again.`,
    nav,
  };
}

function finish(
  kind: "success" | "fail",
  applyLost: boolean,
  message: string,
  playerSuccesses: number,
  hedgeSuccesses: number,
  progress: number,
  hedgeProgress: number,
  target: number,
  turns: number,
  hedgeEdge: boolean,
): NavTurnResult {
  return {
    kind,
    playerSuccesses,
    hedgeSuccesses,
    progress,
    hedgeProgress,
    target,
    turns,
    hedgeEdge,
    applyLost,
    message,
    nav: undefined,
  };
}

export function readNavState(
  sheet: CofdSheet,
): HedgeNavState | null {
  const n = sheet.hedgeState?.nav;
  if (!n || typeof n !== "object") return null;
  if (typeof n.goal !== "string" || !n.goal) return null;
  return {
    goal: n.goal,
    progress: Number(n.progress) || 0,
    hedgeProgress: Number(n.hedgeProgress) || 0,
    target: Number(n.target) || 8,
    turns: Number(n.turns) || 0,
    hedgeEdge: n.hedgeEdge === true,
    startedAt: Number(n.startedAt) || Date.now(),
  };
}

export function writeNavState(
  sheet: CofdSheet,
  nav: HedgeNavState | null,
): CofdSheet {
  const base = { ...(sheet.hedgeState ?? {}) } as Record<
    string,
    unknown
  >;
  if (nav) base.nav = nav;
  else delete base.nav;
  return {
    ...sheet,
    hedgeState: base as CofdSheet["hedgeState"],
  };
}

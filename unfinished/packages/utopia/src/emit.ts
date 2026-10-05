import { gameHooks } from "@ursamu/mush";
import type {
  IUtopiaFeedPayload,
  IUtopiaGMPayload,
  IUtopiaWeekReadyPayload,
} from "./hooks-augment.ts";

export function stripMush(s: string): string {
  return s
    .replace(/%c[nNrRgGyYbBmMcCwWxXhHuUiI]/g, "")
    .replace(/%c/gi, "")
    .replace(/%[rntbRNTB]/g, "")
    .trim();
}

export function formatRollNote(opts: {
  name: string;
  verb: string;
  total: number;
  dv: number;
  result: string;
  dangerFrom: number;
  dangerTo: number;
}): string {
  const name = stripMush(opts.name);
  const face = opts.result.toUpperCase();
  return (
    `${name} ${opts.verb}: ${opts.total} vs DV ${opts.dv}` +
    ` — ${face} (danger ${opts.dangerFrom}→${opts.dangerTo})`
  );
}

export function formatWeekNote(opts: {
  city: string;
  week: number;
  plans: { playerName: string; plan: string }[];
}): string {
  const lines = opts.plans.map((p) =>
    `${stripMush(p.playerName)}: ${stripMush(p.plan)}`
  );
  return `Week ${opts.week} in ${stripMush(opts.city)}\n` +
    lines.join("\n");
}

export function formatFeedNote(opts: {
  city: string;
  week: number;
  headlines: string[];
}): string {
  return `Week ${opts.week} ${stripMush(opts.city)}: ` +
    opts.headlines.map(stripMush).join("; ");
}

export function emitRoll(p: IUtopiaGMPayload): void {
  // deno-lint-ignore no-explicit-any
  (gameHooks as any).emit?.("utopia:roll", {
    ...p,
    playerName: stripMush(p.playerName),
    summary: stripMush(p.summary),
    autoWatch: true,
  });
}

export function emitWeekReady(p: IUtopiaWeekReadyPayload): void {
  // deno-lint-ignore no-explicit-any
  (gameHooks as any).emit?.("utopia:week:ready", {
    ...p,
    city: stripMush(p.city),
    summary: stripMush(p.summary),
    plans: p.plans.map((x) => ({
      ...x,
      playerName: stripMush(x.playerName),
      plan: stripMush(x.plan),
    })),
    autoWatch: true,
  });
}

export function emitFeedTicked(p: IUtopiaFeedPayload): void {
  // deno-lint-ignore no-explicit-any
  (gameHooks as any).emit?.("utopia:feed:ticked", {
    ...p,
    playerName: stripMush(p.playerName),
    summary: stripMush(p.summary),
    autoWatch: true,
  });
}

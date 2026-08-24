/** Console / ICE / malware response effects. */
import type { ISprawlChar } from "../db/schemas.ts";
import { find } from "./catalog.ts";
import { rollConsoleDestroy } from "./hull-specials.ts";
import { consoleSpec } from "./net.ts";
import { nowMs, parseDuration } from "./net-state.ts";
import type { FxCtx } from "./sys-response-fx.ts";

function d6(rng: () => number): number {
  return 1 + Math.floor(rng() * 6);
}
function nd6(n: number, rng: () => number): number {
  let t = 0;
  for (let i = 0; i < n; i++) t += d6(rng);
  return t;
}

function wipeSoft(
  c: ISprawlChar,
  count: number,
  rng: () => number,
): { next: ISprawlChar; wiped: string[] } {
  const have = [...(c.software ?? [])];
  const wiped: string[] = [];
  let left = Math.min(count, have.length);
  while (left > 0 && have.length) {
    wiped.push(
      have.splice(Math.floor(rng() * have.length), 1)[0]!,
    );
    left--;
  }
  return { next: { ...c, software: have }, wiped };
}

/** Returns true if handled. */
export function fxConsole(ctx: FxCtx): boolean {
  const { sys, rng, n, notes } = ctx;
  const row = find("systemResponse", sys.slug);
  const dur = parseDuration(
    String(sys.duration ?? row?.duration ?? "") || undefined,
    rng,
  );
  const s = sys.slug;

  if (s === "powered-down") {
    n.consoleDownUntil = nowMs() + (dur.ms ?? 1_800_000);
    notes.push(`console powered down (${dur.label || "30 min"})`);
    return true;
  }
  if (s === "locked-out") {
    n.lockoutUntil = nowMs() +
      (dur.ms ?? nd6(2, rng) * 3_600_000);
    notes.push(`locked out (${dur.label || "hours"})`);
    return true;
  }
  if (s === "malware-i") {
    n.ramPenalty = (n.ramPenalty ?? 0) + 1;
    n.ramPenaltyUntil = nowMs() +
      (dur.ms ?? nd6(2, rng) * 60_000);
    notes.push(`RAM -1 for ${dur.label || "mins"}`);
    return true;
  }
  if (s === "dos") {
    n.ramZeroUntil = nowMs() +
      (dur.ms ?? nd6(2, rng) * 60_000);
    notes.push(`all RAM dead ${dur.label || "mins"}`);
    return true;
  }
  if (s === "overload") {
    n.driveBurned = true;
    notes.push("hard drive burned — RAM dead until repair");
    return true;
  }
  if (s === "malware-ii") {
    const w = wipeSoft(ctx.c, d6(rng), rng);
    ctx.c = w.next;
    notes.push(
      w.wiped.length
        ? `wiped software: ${w.wiped.join(", ")}`
        : "no software to wipe",
    );
    return true;
  }
  if (s === "back-hack") {
    const spec = consoleSpec(ctx.c);
    const atk = nd6(2, rng) + 10;
    if (spec) {
      const r = rollConsoleDestroy(spec, atk);
      notes.push(`back-hack ${atk} vs destroy DS${r.ds}`);
      if (r.destroyed) {
        n.consoleBurned = true;
        ctx.c = { ...ctx.c, console: undefined, software: [] };
        notes.push("console destroyed");
      } else {
        n.consoleDownUntil = nowMs() + nd6(2, rng) * 3_600_000;
        notes.push("console seized — down for hours");
      }
    } else {
      n.consoleDownUntil = nowMs() + nd6(2, rng) * 3_600_000;
      notes.push("console seized — down for hours");
    }
    return true;
  }
  if (s === "ice-i" || s === "ice-ii") {
    const up = nd6(s === "ice-ii" ? 2 : 1, rng);
    n.iceDsBonus = (n.iceDsBonus ?? 0) + up;
    notes.push(`ICE +${up} DS (now +${n.iceDsBonus})`);
    return true;
  }
  if (s === "hard-freeze") {
    const enc = nd6(3, rng);
    n.iceDsBonus = (n.iceDsBonus ?? 0) + Math.ceil(enc / 3);
    notes.push(`hard freeze encrypt DS${enc}`);
    return true;
  }
  if (s === "maze-ii") {
    n.mazeTurns = (n.mazeTurns ?? 0) +
      (dur.turns ?? nd6(2, rng));
    notes.push(`maze trap — ${n.mazeTurns} turns stuck`);
    return true;
  }
  if (s === "malware-iii") {
    n.consoleDownUntil = nowMs() +
      (dur.ms ?? nd6(2, rng) * 3_600_000);
    notes.push(`console disabled ${dur.label || "hours"}`);
    return true;
  }
  if (s === "malware-iv") {
    n.malwareCleanDs = nd6(2, rng);
    n.consoleDownUntil = nowMs() + 86_400_000;
    notes.push(
      `malware lock — +console/clean vs DS${n.malwareCleanDs}`,
    );
    return true;
  }
  if (s === "system-update") {
    const ex = [...(n.exploits ?? [])];
    notes.push(
      ex.length
        ? `exploit closed: ${ex.pop()}`
        : "no held exploit to close",
    );
    n.exploits = ex;
    return true;
  }
  return false;
}

/** Flesh / heat / neurostim response effects. */
import { find } from "./catalog.ts";
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

function heat(ctx: FxCtx, amt: number, note: string): void {
  ctx.n.heat = (ctx.n.heat ?? 0) + amt;
  ctx.n.heatNote = note;
  ctx.notes.push(`${note} (heat +${amt})`);
}

function morph(ctx: FxCtx, ds: number): void {
  const total = d6(ctx.rng) + d6(ctx.rng) +
    (ctx.c.stats.morphology ?? 0);
  const ok = total >= ds;
  ctx.notes.push(
    `Morphology ${total} vs DS${ds}` +
      (ok ? " — hold" : " — fail"),
  );
  if (!ok) {
    ctx.neural += 2;
    ctx.notes.push("failed morph check: +2 neural");
  }
}

/** Returns true if handled. */
export function fxBody(ctx: FxCtx): boolean {
  const { sys, rng, n, notes } = ctx;
  const row = find("systemResponse", sys.slug);
  const dur = parseDuration(
    String(sys.duration ?? row?.duration ?? "") || undefined,
    rng,
  );
  const s = sys.slug;
  const tags = sys.tags?.length
    ? sys.tags
    : ((row?.tags as string[]) ?? []);

  if (s === "log-off") {
    n.ejected = true;
    notes.push("jacked out (Log-Off)");
    return true;
  }
  if (s === "shutdown" || s === "blackout") {
    notes.push(`node shutting down (${dur.label || "turns"})`);
    return true;
  }
  if (s === "lawfare") {
    heat(ctx, 1, "lawfare");
    return true;
  }
  if (s === "nine-one-one") {
    heat(ctx, 2, `911 TF (~${dur.label || "hours"})`);
    return true;
  }
  if (
    s === "id-trace" || s === "network-trace" ||
    s === "maze-i" || s === "tagged"
  ) {
    n.tagged = true;
    heat(ctx, 1, `trace/tag ${sys.name}`);
    return true;
  }
  if (s === "trace-protocol") {
    n.tagged = true;
    heat(ctx, 2, "TRACE real-space fix");
    return true;
  }
  if (s === "sysop" || s === "more-sysops") {
    heat(ctx, 1, `${sys.name} online`);
    return true;
  }
  if (s === "neurostim-i" || s === "neurostim-ii") {
    n.neurostimUntil = nowMs() +
      (dur.ms ?? nd6(2, rng) * 3_600_000);
    notes.push(`neurostim fog (${dur.label || "hours"})`);
    return true;
  }
  if (s === "bio-electric-feedback") {
    notes.push("senses scrambled (bio-feedback)");
    return true;
  }
  if (s === "neurostim-iii") {
    morph(ctx, Number(row?.morphDs ?? 14));
    return true;
  }
  if (s === "surge-i") {
    morph(ctx, Number(row?.morphDs ?? 16));
    return true;
  }
  if (s === "neurostim-iv") {
    n.immobileUntil = nowMs() +
      (dur.ms ?? nd6(2, rng) * 3_600_000);
    notes.push(`immobilized ${dur.label || "hours"}`);
    return true;
  }
  if (s === "surge-ii") {
    const loss = Math.max(1, Math.ceil(d6(rng) / 2));
    n.cogPenalty = (n.cogPenalty ?? 0) + loss;
    notes.push(`Cognition -${loss} (brainburn)`);
    return true;
  }
  if (s === "seekers") {
    heat(ctx, 2, `${d6(rng)} seeker drones inbound`);
    return true;
  }
  if (s === "tac-team") {
    heat(ctx, 3, `tac-team ETA ${dur.label || "minutes"}`);
    return true;
  }
  if (s === "sense-net") {
    heat(ctx, 2, `${d6(rng)} Sense/Net ops`);
    return true;
  }
  if (tags.includes("disconnect")) {
    n.ejected = true;
    notes.push("disconnected");
    return true;
  }
  notes.push(sys.blurb || sys.name);
  return true;
}

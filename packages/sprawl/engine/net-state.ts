/**
 */
import type { INetState, ISprawlChar } from "../db/schemas.ts";

export function netOf(c: ISprawlChar): INetState {
  return { ...(c.net ?? {}) };
}

export function withNet(
  c: ISprawlChar,
  net: INetState,
): ISprawlChar {
  return { ...c, net };
}

export function nowMs(): number {
  return Date.now();
}

/** Parse "2d6h" | "1d6m" | "2d6t". rng is [0,1). */
export function parseDuration(
  spec: string | undefined,
  rng: () => number,
): { ms?: number; turns?: number; label: string } {
  if (!spec) return { label: "" };
  const m = String(spec).trim().match(
    /^(\d*)d(\d+)([hmt])$/i,
  );
  if (!m) return { label: spec };
  const count = m[1] ? Number(m[1]) : 1;
  const sides = Number(m[2]);
  const unit = m[3].toLowerCase();
  let roll = 0;
  for (let i = 0; i < count; i++) {
    roll += 1 + Math.floor(rng() * sides);
  }
  if (unit === "t") {
    return { turns: roll, label: `${roll} turns` };
  }
  if (unit === "m") {
    return { ms: roll * 60_000, label: `${roll} min` };
  }
  return { ms: roll * 3_600_000, label: `${roll} hr` };
}

/** Clear expired timers; tick maze each call. */
export function tickNetState(c: ISprawlChar): ISprawlChar {
  const n = netOf(c);
  let changed = false;
  const t = nowMs();
  const drop = (k: keyof INetState) => {
    if (n[k] != null) {
      delete n[k];
      changed = true;
    }
  };
  if (n.lockoutUntil && n.lockoutUntil <= t) drop("lockoutUntil");
  if (n.consoleDownUntil && n.consoleDownUntil <= t) {
    drop("consoleDownUntil");
  }
  if (n.ramPenaltyUntil && n.ramPenaltyUntil <= t) {
    drop("ramPenalty");
    drop("ramPenaltyUntil");
  }
  if (n.ramZeroUntil && n.ramZeroUntil <= t) drop("ramZeroUntil");
  if (n.immobileUntil && n.immobileUntil <= t) {
    drop("immobileUntil");
  }
  if (n.neurostimUntil && n.neurostimUntil <= t) {
    drop("neurostimUntil");
  }
  if (n.softDsPenaltyUntil && n.softDsPenaltyUntil <= t) {
    drop("softDsPenalty");
    drop("softDsPenaltyUntil");
  }
  if (n.jamUntil && n.jamUntil <= t) drop("jamUntil");
  if (n.mazeTurns && n.mazeTurns > 0) {
    n.mazeTurns -= 1;
    if (n.mazeTurns <= 0) delete n.mazeTurns;
    changed = true;
  }
  if (n.ejected) {
    delete n.ejected;
    changed = true;
  }
  return changed ? withNet(c, n) : c;
}

export function hackBlockedReason(
  c: ISprawlChar,
): string | null {
  const n = c.net ?? {};
  const t = nowMs();
  if (n.lockoutUntil && n.lockoutUntil > t) {
    return "Locked out of the net — wait it out.";
  }
  if (n.consoleDownUntil && n.consoleDownUntil > t) {
    return "Console is down (malware/power).";
  }
  if (n.consoleBurned) {
    return "Console burned out — equip a new one.";
  }
  if (n.malwareCleanDs != null) {
    return (
      `Console malware — clean vs DS${n.malwareCleanDs}` +
      ` (+console/clean).`
    );
  }
  if (n.immobileUntil && n.immobileUntil > t) {
    return "Synaptic overload — can't act yet.";
  }
  if (!c.console) {
    return "Equip a console first (+console/equip).";
  }
  return null;
}

export function effectiveCognition(c: ISprawlChar): number {
  const pen = c.net?.cogPenalty ?? 0;
  return Math.max(0, (c.stats.cognition ?? 0) - pen);
}

export function tryCleanMalware(
  c: ISprawlChar,
  rng: () => number = Math.random,
): { next: ISprawlChar; notes: string[] } {
  const ds = c.net?.malwareCleanDs;
  if (ds == null) {
    return { next: c, notes: ["no malware lock"] };
  }
  const cog = effectiveCognition(c);
  const total = 1 + Math.floor(rng() * 6) +
    1 + Math.floor(rng() * 6) + cog;
  if (total > ds) {
    const n = netOf(c);
    delete n.malwareCleanDs;
    delete n.consoleDownUntil;
    return {
      next: withNet(c, n),
      notes: [`clean ${total} vs DS${ds} — malware purged`],
    };
  }
  return {
    next: c,
    notes: [`clean ${total} vs DS${ds} — still infected`],
  };
}

export function netStatusLines(c: ISprawlChar): string[] {
  const n = c.net;
  if (!n) return [];
  const lines: string[] = [];
  const t = nowMs();
  if (n.lockoutUntil && n.lockoutUntil > t) {
    lines.push("lockout active");
  }
  if (n.consoleDownUntil && n.consoleDownUntil > t) {
    lines.push("console down");
  }
  if (n.driveBurned) lines.push("drive burned (RAM 0)");
  if (n.consoleBurned) lines.push("console destroyed");
  if (n.tagged) lines.push("tagged");
  if (n.heat) lines.push(`heat ${n.heat}`);
  if (n.iceDsBonus) lines.push(`ICE +${n.iceDsBonus} DS`);
  if (n.ramPenalty) lines.push(`RAM -${n.ramPenalty}`);
  if (n.ramZeroUntil && n.ramZeroUntil > t) {
    lines.push("RAM zeroed (DoS)");
  }
  if (n.mazeTurns) lines.push(`maze ${n.mazeTurns}t`);
  if (n.malwareCleanDs != null) {
    lines.push(`malware DS${n.malwareCleanDs}`);
  }
  if (n.cogPenalty) lines.push(`Cog -${n.cogPenalty}`);
  if (n.softDsPenalty) {
    lines.push(`soft DS -${n.softDsPenalty}`);
  }
  if (n.destroyTurns != null) {
    lines.push(`Khali destroy in ${n.destroyTurns}`);
  }
  if (n.jamUntil && n.jamUntil > t) lines.push("comms jammed");
  if (n.traceDelayMin) {
    lines.push(`trace delay +${n.traceDelayMin}m`);
  }
  if (n.eyesOn) lines.push("Eyes_On armed");
  if (n.exploits?.length) {
    lines.push(`bank ${n.exploits.length}: ` +
      n.exploits.slice(0, 4).join(", ") +
      (n.exploits.length > 4 ? "…" : ""));
  }
  if (n.blockNextResponse) {
    lines.push(`block response ×${n.blockNextResponse}`);
  }
  if (n.stealthUpgrade) {
    lines.push(`stealth +${n.stealthUpgrade} Upgrade`);
  }
  if (n.extraHack) lines.push("extra hack ready");
  if (n.malwareImmuneHacks) {
    lines.push(`immunoware ${n.malwareImmuneHacks}h`);
  }
  if (n.backDoorUntil && n.backDoorUntil > t) {
    lines.push("back door open");
  }
  if (n.easyScripter) lines.push("easy scripter");
  if (n.pendingSpawns?.length) {
    lines.push(`inbound ${n.pendingSpawns.length} response(s)`);
  }
  if (n.heatNote) lines.push(n.heatNote);
  if (n.lastSoftNote) lines.push(n.lastSoftNote);
  return lines;
}

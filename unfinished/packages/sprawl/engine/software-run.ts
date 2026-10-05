import type { ISprawlChar } from "../db/schemas.ts";
import type { Row } from "./catalog.ts";
import { burnSoftware } from "./net.ts";
import { netOf, nowMs, withNet } from "./net-state.ts";

export type RunResult = {
  next: ISprawlChar;
  notes: string[];
  error?: string;
};

function d6(rng: () => number): number {
  return 1 + Math.floor(rng() * 6);
}
function nd6(n: number, rng: () => number): number {
  let t = 0;
  for (let i = 0; i < n; i++) t += d6(rng);
  return t;
}

/** Apply run effect. Caller ensures software is loaded. */
export function runSoftwareEffect(
  c: ISprawlChar,
  row: Row,
  rng: () => number,
): RunResult {
  const effect = String(row.effect ?? "");
  const name = String(row.name ?? row.slug);
  const slug = row.slug;
  let next = c;
  const notes: string[] = [];
  const n = netOf(next);

  const burn = (sheet: ISprawlChar) => burnSoftware(sheet, slug);

  switch (effect) {
    case "neural-soak-2":
      return { next: c, notes: [`${name} is passive (auto soak)`] };
    case "flatline-recover-2":
      return {
        next: c,
        notes: [`${name} is passive (auto at Res 0)`],
      };
    case "bonus-penetrate":
    case "bonus-find":
    case "bonus-stealth":
    case "bonus-peripheral":
    case "bonus-weapons":
    case "bonus-locks":
      return {
        next: c,
        notes: [`${name} is passive (+ on matching hacks)`],
      };
    case "upgrade-control":
    case "upgrade-decrypt":
      return {
        next: c,
        notes: [`${name} auto-Upgrade on matching hacks`],
      };
    case "destroy-system-d6": {
      const turns = d6(rng);
      n.destroyTurns = turns;
      notes.push(`${name}: system dies in ${turns} hacks`);
      return { next: burn(withNet(next, n)), notes };
    }
    case "false-signals-2d6": {
      const sigs = nd6(2, rng);
      n.heat = Math.max(0, (n.heat ?? 0) - 1);
      n.heatNote = `${sigs} false intrusion signals`;
      notes.push(`${name}: ${sigs} false signals (heat -1)`);
      return { next: burn(withNet(next, n)), notes };
    }
    case "stun-hacker-d6": {
      const t = d6(rng);
      n.lastSoftNote = `SysOp stunned ${t} turns`;
      notes.push(`${name}: stun enemy hacker ${t} turns`);
      return { next: burn(withNet(next, n)), notes };
    }
    case "electrical-fire":
      n.lastSoftNote = "target hardware on fire";
      notes.push(`${name}: electrical fire on target`);
      return { next: burn(withNet(next, n)), notes };
    case "keylog":
      n.lastSoftNote = "keylogger planted";
      notes.push(`${name}: keystrokes recording`);
      return { next: burn(withNet(next, n)), notes };
    case "crack-password-2d6": {
      const turns = nd6(2, rng);
      n.lastSoftNote = `Ripper cracking (${turns}t)`;
      notes.push(`${name}: brute-force — ${turns} turns`);
      return { next: burn(withNet(next, n)), notes };
    }
    case "get-maps":
      n.lastSoftNote = "maps/schematics pulled";
      notes.push(`${name}: maps and schematics retrieved`);
      return { next: withNet(next, n), notes };
    case "delay-trace-wipe": {
      const mins = d6(rng);
      n.traceDelayMin = (n.traceDelayMin ?? 0) + mins;
      n.tagged = false;
      if (n.heat) n.heat = Math.max(0, n.heat - 1);
      notes.push(`${name}: +${mins}m trace delay, wipe`);
      return { next: burn(withNet(next, n)), notes };
    }
    case "jam-comms-d6": {
      const mins = d6(rng);
      n.jamUntil = nowMs() + mins * 60_000;
      notes.push(`${name}: comms jammed ${mins} min`);
      return { next: withNet(next, n), notes };
    }
    case "recover-files-d6": {
      const nFiles = d6(rng);
      n.lastSoftNote = `recovered ${nFiles} files`;
      notes.push(`${name}: recovered ${nFiles} files`);
      return { next: withNet(next, n), notes };
    }
    case "clean-malware-2d6h": {
      const hrs = nd6(2, rng);
      delete n.malwareCleanDs;
      delete n.consoleDownUntil;
      n.lastSoftNote = `Vaxxer purge (${hrs}h)`;
      notes.push(`${name}: malware purge (${hrs}h)`);
      return { next: withNet(next, n), notes };
    }
    case "crash-node":
      n.lastSoftNote = "node/device crashed";
      notes.push(`${name}: target node crashed`);
      return { next: burn(withNet(next, n)), notes };
    case "teleop-vehicle":
      n.lastSoftNote = "vehicle teleop link open";
      notes.push(`${name}: teleop link open`);
      return { next: withNet(next, n), notes };
    case "trace-target-2d6m": {
      const mins = nd6(2, rng);
      n.lastSoftNote = `Seeker fix in ${mins}m`;
      notes.push(`${name}: locate in ${mins} min`);
      return { next: burn(withNet(next, n)), notes };
    }
    case "drain-cognition":
      n.lastSoftNote = "Brain Drain — target Cog -1";
      notes.push(`${name}: target Cog -1, blackout 2d6h`);
      return { next: burn(withNet(next, n)), notes };
    case "ds-down-1-3m":
      n.softDsPenalty = (n.softDsPenalty ?? 0) + 1;
      n.softDsPenaltyUntil = nowMs() + 3 * 60_000;
      notes.push(`${name}: target DS -1 for 3 min`);
      return { next: burn(withNet(next, n)), notes };
    case "intrusion-alert":
      n.eyesOn = true;
      notes.push(`${name}: watching for intrusion`);
      return { next: withNet(next, n), notes };
    case "wipe-ai-2d6m": {
      const mins = nd6(2, rng);
      n.lastSoftNote = `DeRez AI wipe (${mins}m)`;
      notes.push(`${name}: AI wipe over ${mins} min`);
      return { next: burn(withNet(next, n)), notes };
    }
    case "translate":
      n.lastSoftNote = "Babelware translating";
      notes.push(`${name}: translating data`);
      return { next: withNet(next, n), notes };
    case "demon-pack":
      notes.push(
        `${name}: packs programs (2-in-6 crash on hack)`,
      );
      return { next: c, notes };
    case "edit-text":
      n.lastSoftNote = "text/db edited";
      notes.push(`${name}: text/database saved`);
      return { next: withNet(next, n), notes };
    case "edit-media":
      n.lastSoftNote = "media edited";
      notes.push(`${name}: photo/video saved`);
      return { next: withNet(next, n), notes };
    case "neural-seizure-d6m": {
      const mins = d6(rng);
      n.lastSoftNote = `Frazzler seizures ${mins}m`;
      notes.push(`${name}: seizures ${mins} min`);
      return { next: burn(withNet(next, n)), notes };
    }
    case "ds-rot-d6h": {
      const hrs = d6(rng);
      n.softDsPenalty = (n.softDsPenalty ?? 0) + 1;
      n.softDsPenaltyUntil = nowMs() + hrs * 3_600_000;
      notes.push(`${name}: DS rot ${hrs}h`);
      return { next: burn(withNet(next, n)), notes };
    }
    default:
      return {
        next: c,
        notes: [`${name}: no scripted effect`],
      };
  }
}


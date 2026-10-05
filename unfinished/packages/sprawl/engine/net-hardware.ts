/**
 * Nodejacker street hardware effects.
 */
import type { ISprawlChar } from "../db/schemas.ts";
import {
  NODEJACKER_HW,
  find,
  findByName,
  type Row,
} from "./catalog.ts";
import { consoleSpec } from "./net.ts";
import { effectiveCognition } from "./net-state.ts";
import { netOf, nowMs, withNet } from "./net-state.ts";
import { rollConsoleDestroy } from "./hull-specials.ts";

function d6(rng: () => number): number {
  return 1 + Math.floor(rng() * 6);
}
function nd6(n: number, rng: () => number): number {
  let t = 0;
  for (let i = 0; i < n; i++) t += d6(rng);
  return t;
}

export function resolveHw(q: string): Row | undefined {
  return find("nodejackerHw", q) ??
    findByName(NODEJACKER_HW, q);
}

export type HwResult =
  | { ok: true; next: ISprawlChar; notes: string[] }
  | { ok: false; error: string };

/** Use nodejacker hardware by slug. */
export function useNetHardware(
  c: ISprawlChar,
  slug: string,
  rng: () => number = Math.random,
): HwResult {
  const row = resolveHw(slug);
  if (!row) return { ok: false, error: "unknown hardware" };
  const s = row.slug;
  const name = String(row.name ?? s);
  const n = netOf(c);
  const notes: string[] = [];
  const cog = effectiveCognition(c);

  switch (s) {
    case "rubber-ducky":
    case "bash-bunny": {
      const ds = Number(row.programDs ?? 12);
      const total = d6(rng) + d6(rng) + cog;
      if (total < ds) {
        return {
          ok: false,
          error: `payload fail ${total} vs DS${ds}`,
        };
      }
      n.lastSoftNote = `${name} payload live`;
      notes.push(`${name} programmed ${total} vs DS${ds}`);
      break;
    }
    case "brickboy": {
      const ds = Number(row.programDs ?? 10);
      const total = d6(rng) + d6(rng) + cog;
      if (total < ds) {
        return {
          ok: false,
          error: `arm fail ${total} vs DS${ds}`,
        };
      }
      n.lastSoftNote = "Brickboy armed on trigger";
      notes.push(`${name} armed ${total} vs DS${ds}`);
      break;
    }
    case "usb-killer": {
      const spec = consoleSpec(c);
      // fry a target device — if testing own console:
      const atk = d6(rng) + d6(rng) + cog + 2;
      if (spec) {
        const r = rollConsoleDestroy(spec, atk);
        notes.push(`USB Killer ${atk} vs DS${r.ds}`);
        if (r.destroyed) {
          n.driveBurned = true;
          notes.push("target drive fried");
        } else {
          notes.push("casing holds");
        }
      } else {
        notes.push(`${name}: device wrecked (no deck check)`);
      }
      break;
    }
    case "grabber": {
      const turns = nd6(2, rng);
      n.lastSoftNote = `Grabber dump ${turns}t`;
      notes.push(`${name}: full HD copy in ${turns} turns`);
      break;
    }
    case "device-detector":
      n.lastSoftNote = "devices pinged 100m";
      notes.push(`${name}: net devices within 100m tagged`);
      break;
    case "wifi-pineapple":
      n.lastSoftNote = "MITM AP up";
      n.heat = (n.heat ?? 0) + 1;
      notes.push(`${name}: MITM sniffer live (heat +1)`);
      break;
    case "flipper-zero":
      n.softDsPenalty = (n.softDsPenalty ?? 0) + 1;
      n.softDsPenaltyUntil = nowMs() + 600_000;
      notes.push(`${name}: recon suite — DS -1 for 10m`);
      break;
    case "omg-cable":
      n.lastSoftNote = "OMG cable injecting";
      notes.push(`${name}: keystroke/RF payload ready`);
      break;
    case "swipe-box":
      n.lastSoftNote = "keycard cloned";
      notes.push(`${name}: swiped card duplicated`);
      break;
    case "faraday-bag":
      n.tagged = false;
      notes.push(`${name}: signals blocked — untagged`);
      break;
    case "geotag":
      n.lastSoftNote = "geotag planted";
      notes.push(`${name}: tracker live`);
      break;
    case "pandora-box": {
      const ds = Number(row.spotDs ?? 12);
      const total = d6(rng) + d6(rng) + cog;
      notes.push(`PANdora ${total} vs SecureBoot~DS${ds}`);
      if (total >= ds) {
        n.softDsPenalty = (n.softDsPenalty ?? 0) + 2;
        n.softDsPenaltyUntil = nowMs() + 1_800_000;
        notes.push("PAN breached — aug DS -2 (30m)");
      } else {
        notes.push("SecureBoot held");
      }
      break;
    }
    default:
      notes.push(`${name}: ${String(row.blurb ?? "used")}`);
  }

  return { ok: true, next: withNet(c, n), notes };
}

/**
 * Defend console vs intrusion: attacker total vs your Firewall.
 */
export function defendConsole(
  c: ISprawlChar,
  attackerTotal: number,
): {
  held: boolean;
  fw: number;
  notes: string[];
  next: ISprawlChar;
} {
  const spec = consoleSpec(c);
  const notes: string[] = [];
  if (!spec) {
    return {
      held: false,
      fw: 0,
      notes: ["no console to defend"],
      next: c,
    };
  }
  const fw = spec.firewall;
  const held = attackerTotal <= fw;
  notes.push(
    `Firewall DS${fw} vs ${attackerTotal} → ` +
      (held ? "HELD" : "BREACHED"),
  );
  let next = c;
  if (!held) {
    const n = netOf(c);
    if (spec.tags.includes("eyes-on") || n.eyesOn) {
      notes.push("Eyes_On alert — intrusion logged");
    }
    n.heat = (n.heat ?? 0) + 1;
    n.heatNote = "console breached";
    // partial: sticky glitch
    next = withNet(c, n);
    notes.push("heat +1 · ICE Glitch incoming");
  }
  return { held, fw, notes, next };
}

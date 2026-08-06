// +frenzy — resist, ride, enter, or end the Beast's frenzy.

import type { IUrsamuSDK } from "@ursamu/ursamu";
import {
  rollFrenzyResist,
  enterFrenzy,
  endFrenzy,
  isFrenzied,
  parseFrenzyKind,
  type FrenzyKind,
} from "../beast/index.ts";
import { isVampireSheet } from "../vitae/index.ts";
import {
  migrateSheet,
  refreshAdvantages,
  type CofdSheet,
} from "../stats/index.ts";

function getSheet(obj: {
  state?: Record<string, unknown>;
}): CofdSheet | null {
  const raw = obj.state?.cofd;
  if (!raw || typeof raw !== "object") return null;
  return migrateSheet(raw);
}

async function persist(
  u: IUrsamuSDK,
  id: string,
  sheet: CofdSheet,
): Promise<void> {
  await u.db.modify(id, "$set", {
    "data.cofd": refreshAdvantages(sheet),
  });
}

/** Parse kind and optional +/-N from rest. */
function parseKindMod(rest: string): {
  kind: FrenzyKind | null;
  mod: number;
  raw: string;
} {
  const m = rest.match(/\s+([+\-]\d+)\s*$/);
  let body = rest.trim();
  let mod = 0;
  if (m) {
    mod = parseInt(m[1], 10);
    body = rest.slice(0, m.index).trim();
  }
  const kind = parseFrenzyKind(body) ??
    (body === "" ? "anger" : null);
  return { kind, mod, raw: body };
}

function outcomeLabel(o: string): string {
  switch (o) {
    case "dramatic":
      return "DRAMATIC FAILURE";
    case "failure":
      return "FAILURE";
    case "success":
      return "SUCCESS";
    case "exceptional":
      return "EXCEPTIONAL SUCCESS";
    default:
      return o.toUpperCase();
  }
}

export async function frenzyExec(u: IUrsamuSDK): Promise<void> {
  const sw = (u.cmd.args[0] ?? "").toLowerCase().trim();
  const rest = u.util.stripSubs(u.cmd.args[1] ?? "").trim();
  const sheet = getSheet(u.me);

  if (!sheet || !isVampireSheet(sheet)) {
    u.send("Only vampires use +frenzy.");
    return;
  }

  if (!sw || sw === "status") {
    if (isFrenzied(sheet)) {
      const kind = sheet.customFields?.frenzy ?? "unknown";
      u.send(`You are frenzied (%cy${kind}%cn).`);
    } else {
      u.send("You are not in frenzy.");
    }
    return;
  }

  if (sw === "end" || sw === "stop") {
    const r = endFrenzy(sheet);
    if (!r.ok || !r.sheet) {
      u.send(r.reason ?? "Cannot end frenzy.");
      return;
    }
    await persist(u, u.me.id, r.sheet);
    u.send(r.lines.join("\n"));
    return;
  }

  if (sw === "enter") {
    const { kind } = parseKindMod(rest || "anger");
    if (!kind) {
      u.send(
        "Usage: +frenzy/enter <hunger|anger|terror>",
      );
      return;
    }
    const r = enterFrenzy(sheet, kind);
    if (!r.ok || !r.sheet) {
      u.send(r.reason ?? "Frenzy failed.");
      return;
    }
    await persist(u, u.me.id, r.sheet);
    u.send(r.lines.join("\n"));
    return;
  }

  if (sw === "ride") {
    const { kind } = parseKindMod(rest || "anger");
    if (!kind) {
      u.send(
        "Usage: +frenzy/ride <hunger|anger|terror>",
      );
      return;
    }
    const r = enterFrenzy(sheet, kind, { ride: true });
    if (!r.ok || !r.sheet) {
      u.send(r.reason ?? "Ride failed.");
      return;
    }
    await persist(u, u.me.id, r.sheet);
    u.send(r.lines.join("\n"));
    return;
  }

  if (sw === "resist") {
    const { kind, mod } = parseKindMod(rest || "anger");
    if (!kind) {
      u.send(
        "Usage: +frenzy/resist <hunger|anger|terror> [+/-N]",
      );
      return;
    }
    const result = rollFrenzyResist({
      kind,
      resolve: sheet.attributes.resolve | 0,
      composure: sheet.attributes.composure | 0,
      humanity: sheet.moralityValue | 0,
      modifier: mod,
    });
    const lines = [
      `%chFrenzy resist (${kind})%cn`,
      `  Pool: Resolve+Composure+HumanityMod` +
        `(${result.humanityMod >= 0 ? "+" : ""}` +
        `${result.humanityMod})` +
        (mod ? ` ${mod >= 0 ? "+" : ""}${mod}` : "") +
        ` = ${result.pool}d`,
      `  Roll: ${result.roll.rolls.join(", ")} → ` +
        `${result.roll.successes} success` +
        `${result.roll.successes === 1 ? "" : "es"}`,
      `  Outcome: %ch${outcomeLabel(result.outcome)}%cn`,
    ];

    if (
      result.outcome === "failure" ||
      result.outcome === "dramatic"
    ) {
      const ent = enterFrenzy(sheet, kind);
      if (ent.ok && ent.sheet) {
        await persist(u, u.me.id, ent.sheet);
        lines.push(...ent.lines);
      }
    } else {
      lines.push("  You hold the Beast in check.");
      if (result.outcome === "exceptional") {
        lines.push(
          "  Exceptional: consider the Steadfast Condition.",
        );
      }
    }
    u.send(lines.join("\n"));
    return;
  }

  u.send(
    "Unknown +frenzy switch. Try /resist, /ride, " +
      "/enter, /end, /status.",
  );
}

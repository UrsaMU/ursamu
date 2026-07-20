// +kenning — fae perception roll (Wits + Wyrd).
// CtL simplified: dedicated kenning instead of a manual +roll.

import type { IUrsamuSDK } from "@ursamu/ursamu";
import { isChangelingSheet } from "../form/index.ts";
import {
  migrateSheet,
  type CofdSheet,
} from "../stats/index.ts";
import {
  executeRoll,
  parseRollExpression,
} from "../roller/index.ts";

function getSheet(
  obj: { state?: Record<string, unknown> },
): CofdSheet | null {
  const raw = obj.state?.cofd;
  if (!raw || typeof raw !== "object") return null;
  return migrateSheet(raw);
}

function tierLabel(successes: number, dramatic: boolean): string {
  if (dramatic || successes <= 0) return "nothing clear";
  if (successes >= 5) return "exceptional insight";
  if (successes >= 3) return "clear sense";
  return "faint traces";
}

function selfRead(
  successes: number,
  dramatic: boolean,
): string[] {
  if (dramatic) {
    return [
      "  Dramatic Failure: you misread the weave —",
      "  the ordinary looks fae, or danger looks safe",
      "  (ST decides).",
    ];
  }
  if (successes <= 0) {
    return [
      "  Failure: no supernatural presence stands out.",
    ];
  }
  if (successes >= 5) {
    return [
      "  Exceptional: you pin the nature of nearby",
      "  magic (fae / other / concealed presence).",
      "  ST: name one true nature or hidden thread.",
    ];
  }
  if (successes >= 3) {
    return [
      "  Success: one supernatural creature, item,",
      "  or active effect per success (presence only).",
    ];
  }
  return [
    "  Weak success: a brush of the Wyrd — something",
    "  unnatural is near, but not what or where.",
  ];
}

function targetRead(
  targetSheet: CofdSheet | null,
  targetName: string,
  successes: number,
  dramatic: boolean,
): string[] {
  if (dramatic) {
    return [
      `  Dramatic Failure on ${targetName}: you misjudge`,
      "  them badly (ST: false harvest / false fae).",
    ];
  }
  if (successes <= 0) {
    return [
      `  Nothing useful from kenning ${targetName}.`,
    ];
  }

  const tmpl = (targetSheet?.template ?? "mortal")
    .toLowerCase()
    .trim();
  const power = targetSheet?.powerStatValue ?? 0;
  const isOtherSupernatural = power > 0 &&
    tmpl !== "mortal" &&
    tmpl !== "changeling";
  const lines: string[] = [];

  if (tmpl === "mortal" || !targetSheet) {
    lines.push(
      `  Mortal read (${targetName}): harvest suitability.`,
    );
    if (successes >= 5) {
      lines.push(
        "  Exceptional: rich Glamour potential or a",
        "  hidden fae-touch — ST names the hook.",
      );
    } else if (successes >= 3) {
      lines.push(
        "  Strong yield if harvested; emotions run deep.",
      );
    } else {
      lines.push(
        "  Thin or guarded Glamour; ordinary soul.",
      );
    }
  } else if (tmpl === "changeling") {
    lines.push(
      `  Fae recognition (${targetName}): Lost kin.`,
    );
    if (successes >= 3) {
      lines.push(
        "  You feel their Wyrd and a hint of seeming",
        "  (ST may confirm Court / Mantle tone).",
      );
    } else {
      lines.push(
        "  Another of the Lost — details stay foggy.",
      );
    }
  } else if (isOtherSupernatural) {
    lines.push(
      `  Glamour signature (${targetName}): supernatural`,
      `  template (${tmpl}).`,
    );
    if (successes >= 3) {
      lines.push(
        "  Clear otherworldly mark; not purely mortal.",
      );
    } else {
      lines.push(
        "  Something wrong under the skin — not human.",
      );
    }
  } else {
    lines.push(
      `  Signature on ${targetName}: ambiguous.`,
    );
  }

  if (successes >= 5) {
    lines.push(
      "  Exceptional: ST may reveal one active",
      "  Contract, Discipline, or concealment tell.",
    );
  }
  return lines;
}

export async function kenningExec(
  u: IUrsamuSDK,
): Promise<void> {
  const rest = u.util.stripSubs(
    (u.cmd.args[1] ?? u.cmd.args[0] ?? "").trim(),
  ).trim();

  const sheet = getSheet(u.me);
  if (!sheet) {
    u.send("No approved character sheet.");
    return;
  }
  if (!isChangelingSheet(sheet)) {
    u.send("Only changelings use kenning this way.");
    return;
  }

  const expr = "Wits+Wyrd";
  const parsed = parseRollExpression(expr, sheet);
  if (parsed.error) {
    u.send(`Kenning pool error: ${parsed.error}`);
    return;
  }

  const roll = executeRoll(parsed.pool);
  const succ = roll.successes;
  const dramatic = roll.dramaticFailure === true;
  const tier = tierLabel(succ, dramatic);
  const label = dramatic
    ? "Dramatic Failure"
    : roll.exceptional
    ? "Exceptional"
    : succ > 0
    ? "Success"
    : "Failure";

  const lines: string[] = [
    `%chKenning%cn  ${expr}  ${parsed.pool}d ` +
      `(${roll.rolls.join(" ")}) -> ${succ} ` +
      `${succ === 1 ? "success" : "successes"} (${label})`,
    `  Tier: ${tier}`,
  ];

  if (!rest) {
    lines.push(...selfRead(succ, dramatic));
    lines.push(
      "  Target someone: +kenning <name>",
    );
    u.send(lines.join("\n"));
    return;
  }

  const target = await u.util.target(u.me, rest, true);
  if (!target) {
    u.send(`Not found: '${rest}'.`);
    return;
  }

  const tSheet = getSheet(target);
  const tName = u.util.displayName(target, u.me);
  lines.push(...targetRead(tSheet, tName, succ, dramatic));
  u.send(lines.join("\n"));
}

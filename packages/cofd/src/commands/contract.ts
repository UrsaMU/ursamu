// +contract -- invoke a known CtL Contract (Glamour + optional roll).
// While Mask is down, successes promote to exceptional (Wyrd floor).

import { divider, type IUrsamuSDK } from "@ursamu/ursamu";
import { findContract } from "../dictionary/changeling.ts";
import {
  applyMienContractBoost,
  contractHasDicePool,
  contractPoolExpr,
  ownsContract,
  parseContractCost,
  resolveOwnedContract,
} from "../form/contract_invoke.ts";
import { isChangelingSheet, isMienActive } from "../form/index.ts";
import {
  migrateSheet,
  type CofdSheet,
} from "../stats/index.ts";
import { parseRollExpression, executeRoll } from "../roller/index.ts";

function getSheet(
  obj: { state?: Record<string, unknown> },
): CofdSheet | null {
  const raw = obj.state?.cofd;
  if (!raw || typeof raw !== "object") return null;
  return migrateSheet(raw);
}

async function contractList(u: IUrsamuSDK, sheet: CofdSheet) {
  const list = sheet.contracts ?? [];
  const lines: string[] = [await divider("C O N T R A C T S")];
  if (!list.length) {
    lines.push("  No Contracts on this sheet.");
  } else {
    for (const name of list) {
      const c = findContract(name);
      const cost = c?.cost ?? "?";
      const pool = c?.dicePool ?? "—";
      lines.push(`  ${name}`);
      lines.push(`    ${cost}  |  ${pool}`);
    }
  }
  lines.push("  Invoke: +contract <name>");
  u.send(lines.join("\n"));
}

async function contractInfo(u: IUrsamuSDK, name: string) {
  const c = findContract(name);
  if (!c) {
    u.send(`Unknown Contract '${name}'.`);
    return;
  }
  u.send(
    [
      await divider(c.name.toUpperCase()),
      `  ${c.tier} ${c.type}` +
        (c.regalia ? ` · ${c.regalia}` : "") +
        (c.court ? ` · ${c.court}` : ""),
      `  Cost: ${c.cost}`,
      `  Pool: ${c.dicePool}`,
      `  Action: ${c.action}  Duration: ${c.duration}`,
      `  ${c.effect}`,
      c.loophole && c.loophole !== "—"
        ? `  Loophole: ${c.loophole}`
        : "",
    ].filter(Boolean).join("\n"),
  );
}

async function contractInvoke(
  u: IUrsamuSDK,
  sheet: CofdSheet,
  name: string,
): Promise<void> {
  const c = resolveOwnedContract(sheet, name);
  if (!c) {
    if (findContract(name) && !ownsContract(sheet, name)) {
      u.send(`You do not know '${name}'.`);
      return;
    }
    u.send(`Unknown or unowned Contract '${name}'.`);
    return;
  }

  const cost = parseContractCost(c.cost);
  if ((sheet.energyCurrent ?? 0) < cost.glamour) {
    u.send(
      `Not enough Glamour (need ${cost.glamour}, have ` +
        `${sheet.energyCurrent ?? 0}).`,
    );
    return;
  }
  if ((sheet.advantages?.willpowerCurrent ?? 0) < cost.willpower) {
    u.send(`Not enough Willpower (need ${cost.willpower}).`);
    return;
  }

  const next: CofdSheet = {
    ...sheet,
    energyCurrent: (sheet.energyCurrent ?? 0) - cost.glamour,
    advantages: {
      ...sheet.advantages,
      willpowerCurrent:
        (sheet.advantages?.willpowerCurrent ?? 0) - cost.willpower,
    },
  };

  const lines: string[] = [];
  lines.push(`You invoke %ch${c.name}%cn.`);
  if (cost.glamour || cost.willpower) {
    const bits: string[] = [];
    if (cost.glamour) bits.push(`Glamour -${cost.glamour}`);
    if (cost.willpower) bits.push(`WP -${cost.willpower}`);
    lines.push(
      `  ${bits.join(", ")}  (Glamour ${next.energyCurrent}, ` +
        `WP ${next.advantages.willpowerCurrent}).`,
    );
  }

  if (contractHasDicePool(c)) {
    const expr = contractPoolExpr(c);
    const parsed = parseRollExpression(expr, next);
    if (parsed.error) {
      lines.push(`  Pool error: ${parsed.error}`);
      lines.push(`  Effect (ST): ${c.effect}`);
    } else {
      const roll = executeRoll(parsed.pool);
      let succ = roll.successes;
      let exceptional = roll.exceptional;
      let boostNote = "";
      if (succ > 0 && isMienActive(next)) {
        const boost = applyMienContractBoost(next, succ);
        succ = boost.successes;
        exceptional = boost.exceptional;
        if (boost.boosted) boostNote = " [mien: exceptional]";
      }
      const dice = roll.rolls.join(" ");
      const label = exceptional
        ? "Exceptional"
        : succ > 0
        ? "Success"
        : roll.dramaticFailure
        ? "Dramatic Failure"
        : "Failure";
      lines.push(
        `  ROLL ${expr}  ${parsed.pool}d (${dice}) -> ` +
          `${succ} ${succ === 1 ? "success" : "successes"} ` +
          `(${label})${boostNote}`,
      );
      lines.push(`  ${c.effect}`);
    }
  } else {
    lines.push(`  ${c.effect}`);
    if (isMienActive(next)) {
      lines.push("  Mask down: impress Door on witnesses — ST.");
    }
  }

  await u.db.modify(u.me.id, "$set", { "data.cofd": next });
  u.send(lines.join("\n"));
  u.broadcast?.(
    `%ch${u.util.displayName(u.me, u.me)}%cn invokes ${c.name}.`,
  );
}

export async function contractExec(u: IUrsamuSDK): Promise<void> {
  const sw = (u.cmd.args[0] ?? "").toLowerCase().trim();
  const rest = u.util.stripSubs(u.cmd.args[1] ?? "").trim();

  const sheet = getSheet(u.me);
  if (!sheet) {
    u.send("No approved character sheet.");
    return;
  }
  if (!isChangelingSheet(sheet)) {
    u.send("Only changelings invoke Contracts this way.");
    return;
  }

  if (sw === "list" || (sw === "" && rest === "")) {
    await contractList(u, sheet);
    return;
  }
  if (sw === "info") {
    if (!rest) {
      u.send("Usage: +contract/info <name>");
      return;
    }
    await contractInfo(u, rest);
    return;
  }

  // +contract <full name>  or  +contract/<Name> (single token)
  const name = rest || sw;
  await contractInvoke(u, sheet, name);
}

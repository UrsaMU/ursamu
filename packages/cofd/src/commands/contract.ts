// +contract -- invoke a known CtL Contract (Glamour + optional roll).
// While Mask is down, successes promote to exceptional (Wyrd floor).

import { divider, type IUrsamuSDK } from "@ursamu/ursamu";
import {
  findContract,
  type CtlContract,
} from "../dictionary/index.ts";
import { favoredRegalia } from "../chargen/contracts.ts";
import {
  applyLoopholeCost,
  applyMienContractBoost,
  contractHasDicePool,
  contractHasLoophole,
  contractPoolExpr,
  matchingSeemingClauses,
  ownsContract,
  parseContractCost,
  resolveOwnedContract,
} from "../form/contract_invoke.ts";
import {
  applyEffectHooks,
  applyHooksToTarget,
  parseEffectHooks,
} from "../form/contract_effects.ts";
import { isChangelingSheet, isMienActive } from "../form/index.ts";
import {
  migrateSheet,
  type CofdSheet,
} from "../stats/index.ts";
import { parseRollExpression, executeRoll } from "../roller/index.ts";
import {
  addSpentEnergy,
  getEncounterForRoom,
  glamourSpendLimit,
} from "../combat/encounter.ts";
import { addDebt } from "../market/index.ts";

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
  const clauses = (c.seemingClauses ?? [])
    .map((s) => `  ${s.seeming}: ${s.effect}`)
    .join("\n");
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
      clauses ? `  Seeming clauses:\n${clauses}` : "",
      "  Invoke free via loophole: +contract/loophole <name>",
    ].filter(Boolean).join("\n"),
  );
}

async function contractInvoke(
  u: IUrsamuSDK,
  sheet: CofdSheet,
  name: string,
  useLoophole = false,
): Promise<void> {
  // Optional target: "Name on Alice" (not "=" — grant uses =)
  let contractName = name.trim();
  let targetName = "";
  const onM = name.match(/^(.+?)\s+on\s+(.+)$/i);
  if (onM) {
    contractName = onM[1].trim();
    targetName = onM[2].trim();
  }

  const c = resolveOwnedContract(sheet, contractName);
  if (!c) {
    if (findContract(contractName) && !ownsContract(sheet, contractName)) {
      u.send(`You do not know '${contractName}'.`);
      return;
    }
    u.send(`Unknown or unowned Contract '${contractName}'.`);
    return;
  }

  if (useLoophole && !contractHasLoophole(c)) {
    u.send(`'${c.name}' has no listed loophole.`);
    return;
  }

  const baseCost = parseContractCost(c.cost);
  let cost = applyLoopholeCost(baseCost, useLoophole);
  // Autumn Mantle •••: −1 Glamour vs Fae (target changeling/fetch/huntsman)
  if (targetName && cost.glamour > 0) {
    try {
      const { mantleContractGlamourDiscount } = await import(
        "../form/mantle_high.ts"
      );
      const tProbe = await u.util.target(u.me, targetName, true);
      const tSheet = tProbe ? getSheet(tProbe) : null;
      const tmpl = (tSheet?.template ?? "").toLowerCase();
      const vsFae = tmpl === "changeling" || tmpl === "fetch" ||
        tmpl === "huntsman" || tmpl === "hobgoblin";
      const disc = mantleContractGlamourDiscount(sheet, vsFae);
      if (disc > 0) {
        cost = { ...cost, glamour: Math.max(0, cost.glamour - disc) };
      }
    } catch {
      // ignore
    }
  }
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

  // Glamour spend limit check
  if (cost.glamour > 0) {
    const roomId = u.here?.id ?? "";
    const encounter = roomId ? await getEncounterForRoom(roomId) : null;
    if (encounter && encounter.status === "active") {
      const tp = encounter.participants.find((p) => p.actorId === u.me.id);
      if (tp) {
        const limit = glamourSpendLimit(sheet.powerStatValue);
        const spent = tp.spentEnergy ?? 0;
        if (spent + cost.glamour > limit) {
          u.send(
            `Cannot spend ${cost.glamour} Glamour. Your turn spend limit ` +
              `is ${limit} (already spent: ${spent}).`,
          );
          return;
        }
        await addSpentEnergy(encounter.id, u.me.id, cost.glamour);
      }
    }
  }

  let next: CofdSheet = {
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
  if (useLoophole) {
    lines.push(
      `  Loophole: ${c.loophole} (Glamour waived).`,
    );
  }
  if (cost.glamour || cost.willpower) {
    const bits: string[] = [];
    if (cost.glamour) bits.push(`Glamour -${cost.glamour}`);
    if (cost.willpower) bits.push(`WP -${cost.willpower}`);
    lines.push(
      `  ${bits.join(", ")}  (Glamour ${next.energyCurrent}, ` +
        `WP ${next.advantages.willpowerCurrent}).`,
    );
  } else if (!useLoophole) {
    lines.push("  No cost.");
  }

  let succ = 1; // no-pool contracts count as success if paid
  if (contractHasDicePool(c)) {
    const expr = contractPoolExpr(c);
    const parsed = parseRollExpression(expr, next);
    if (parsed.error) {
      lines.push(`  Pool error: ${parsed.error}`);
      lines.push(`  Effect (ST): ${c.effect}`);
      succ = 0;
    } else {
      const roll = executeRoll(parsed.pool);
      succ = roll.successes;
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

  for (const sc of matchingSeemingClauses(next, c)) {
    lines.push(`  Seeming (${sc.seeming}): ${sc.effect}`);
  }

  // Auto Conditions/Tilts from effect text
  const hooks = parseEffectHooks(c.effect);
  if (hooks.length && succ > 0) {
    const inflict = /\b(target|victim|foe|enemy|audience)\b/i
      .test(c.effect);
    if (inflict && targetName) {
      const t = await u.util.target(u.me, targetName, true);
      if (t) {
        const tSheet = getSheet(t);
        if (tSheet) {
          const r = applyHooksToTarget(
            tSheet,
            c.effect,
            succ,
            c.name,
          );
          if (r.applied.length) {
            await u.db.modify(t.id, "$set", {
              "data.cofd": r.sheet,
            });
            lines.push(
              `  On ${u.util.displayName(t, u.me)}:`,
            );
            lines.push(...r.lines.map((l) => `  ${l}`));
          }
        }
      } else {
        lines.push(`  Target '${targetName}' not found.`);
      }
      // Self-buffs still on enactor
      const selfR = applyEffectHooks(next, c.effect, {
        successes: succ,
        onTarget: false,
        note: c.name,
      });
      next = selfR.sheet;
      for (const l of selfR.lines) {
        if (l.includes("Inspired") || l.includes("Steadfast") ||
          l.includes("Wanton")) {
          lines.push(l);
        }
      }
    } else if (!inflict) {
      const r = applyEffectHooks(next, c.effect, {
        successes: succ,
        note: c.name,
      });
      next = r.sheet;
      lines.push(...r.lines);
    } else {
      // Inflict but no target — list hooks for ST
      lines.push(
        "  Effect hooks (name a target: +contract Name on X):",
      );
      for (const h of hooks) {
        lines.push(`    ${h.kind}: ${h.name}`);
      }
    }
  }

  await u.db.modify(u.me.id, "$set", { "data.cofd": next });
  u.send(lines.join("\n"));
  u.broadcast?.(
    `%ch${u.util.displayName(u.me, u.me)}%cn invokes ${c.name}.`,
  );
}

function isStaff(actor: { flags: Set<string> }): boolean {
  const f = actor.flags;
  return f.has("admin") || f.has("builder") || f.has("wizard");
}

function checkPrerequisites(
  sheet: CofdSheet,
  c: CtlContract,
): { ok: boolean; error?: string } {
  if (c.type === "arcadian" && c.tier === "royal") {
    const favored = favoredRegalia(sheet);
    if (
      !c.regalia ||
      !favored.some((r) => r.toLowerCase() === c.regalia!.toLowerCase())
    ) {
      return {
        ok: false,
        error:
          `Royal Arcadian Contracts must come from a favored Regalia ` +
          `(${favored.join(", ")}).`,
      };
    }
  }

  if (c.type === "court" && c.court) {
    const courtKey = c.court.toLowerCase();
    const ownCourt = (sheet.customFields?.court ?? "").trim().toLowerCase();

    if (courtKey === ownCourt) {
      const mantleVal = sheet.merits[`mantle:${courtKey}`] ?? 0;
      const goodwillVal = sheet.merits[`court goodwill:${courtKey}`] ?? 0;
      if (c.tier === "royal") {
        if (mantleVal < 3 && goodwillVal < 5) {
          return {
            ok: false,
            error:
              `Royal Court Contracts require Mantle (${c.court}) 3+ ` +
              `or Court Goodwill (${c.court}) 5+.`,
          };
        }
      } else {
        if (mantleVal < 1 && goodwillVal < 2) {
          return {
            ok: false,
            error:
              `Common Court Contracts require Mantle (${c.court}) 1+ ` +
              `or Court Goodwill (${c.court}) 2+.`,
          };
        }
      }
    } else {
      const existing = (sheet.contracts ?? [])
        .map(findContract)
        .filter(Boolean) as CtlContract[];
      const extOfTier = existing.filter(
        (ext) =>
          ext.type === "court" &&
          ext.court &&
          ext.court.toLowerCase() !== ownCourt &&
          ext.tier === c.tier,
      );

      if (c.tier === "royal") {
        const goodwillVal = sheet.merits[`court goodwill:${courtKey}`] ?? 0;
        if (goodwillVal >= 4) {
          if (extOfTier.length >= 1) {
            return {
              ok: false,
              error:
                `You may only learn one external Royal Court Contract. ` +
                `You already have: ${extOfTier.map((e) => e.name).join(", ")}.`,
            };
          }
        } else {
          return {
            ok: false,
            error:
              `Learning an external Royal Court Contract requires ` +
              `Court Goodwill (${c.court}) 4+ (and limited to one).`,
          };
        }
      } else {
        if (extOfTier.length >= 1) {
          const mantleVal = sheet.merits[`mantle:${courtKey}`] ?? 0;
          const goodwillVal = sheet.merits[`court goodwill:${courtKey}`] ??
            0;
          if (mantleVal < 1 && goodwillVal < 2) {
            return {
              ok: false,
              error:
                `You may learn one external Common Court Contract without ` +
                `prerequisites. To learn more, you require Mantle (${c.court}) ` +
                `1+ or Court Goodwill (${c.court}) 2+.`,
            };
          }
        }
      }
    }
  }

  return { ok: true };
}

async function contractLearn(u: IUrsamuSDK, rest: string) {
  const c = findContract(rest);
  if (!c) {
    u.send(`Unknown Contract '${rest}'.`);
    return;
  }
  const sheet = getSheet(u.me);
  if (!sheet) {
    u.send("No approved character sheet.");
    return;
  }
  if (!isChangelingSheet(sheet)) {
    u.send("Only changelings can learn Contracts.");
    return;
  }

  const list = sheet.contracts ?? [];
  if (list.some((n) => n.toLowerCase() === c.name.toLowerCase())) {
    u.send(`You already know ${c.name}.`);
    return;
  }

  const prereq = checkPrerequisites(sheet, c);
  if (!prereq.ok) {
    u.send(`Prerequisite error: ${prereq.error}`);
    return;
  }

  const cost = c.tier === "royal" ? 4 : 3;
  const currentXp = sheet.experience ?? 0;
  if (currentXp < cost) {
    u.send(`Insufficient Experience: have ${currentXp} XP, need ${cost} XP.`);
    return;
  }

  sheet.experience = currentXp - cost;
  sheet.contracts = [...list, c.name];

  let next: CofdSheet = sheet;
  let debtNote = "";
  // CtL p.165: Goblin Contracts always cost Goblin Debt.
  if (c.type === "goblin") {
    const r = addDebt(next, {
      to: "Goblin",
      amount: 1,
      note: `Learned Goblin Contract: ${c.name}`,
      listingSlug: c.name.toLowerCase().replace(/\s+/g, "-"),
    });
    next = r.sheet;
    debtNote = " Goblin Contract: 1 Goblin Debt incurred.";
  }

  await u.db.modify(u.me.id, "$set", { "data.cofd": next });
  u.send(
    `Learned ${c.name} for ${cost} XP. Remaining XP: ` +
      `${next.experience}.${debtNote}`,
  );
}

async function contractGrant(u: IUrsamuSDK, rest: string) {
  if (!isStaff(u.me)) {
    u.send("Permission denied. Builder+ required to grant Contracts.");
    return;
  }

  const eq = rest.indexOf("=");
  if (eq < 0) {
    u.send("Usage: +contract/grant <player>=<contract>");
    return;
  }

  const playerName = rest.slice(0, eq).trim();
  const contractName = rest.slice(eq + 1).trim();

  const target = await u.util.target(u.me, playerName, true);
  if (!target) {
    u.send(`Player '${playerName}' not found.`);
    return;
  }

  const sheet = getSheet(target);
  if (!sheet) {
    u.send("That player does not have an approved character sheet yet.");
    return;
  }

  if (!isChangelingSheet(sheet)) {
    u.send("Only changelings can learn Contracts.");
    return;
  }

  const c = findContract(contractName);
  if (!c) {
    u.send(`Unknown Contract '${contractName}'.`);
    return;
  }

  const list = sheet.contracts ?? [];
  if (list.some((n) => n.toLowerCase() === c.name.toLowerCase())) {
    u.send(`${u.util.displayName(target, u.me)} already knows ${c.name}.`);
    return;
  }

  sheet.contracts = [...list, c.name];
  await u.db.modify(target.id, "$set", { "data.cofd": sheet });
  u.send(`Granted ${c.name} to ${u.util.displayName(target, u.me)}.`);
}

export async function contractExec(u: IUrsamuSDK): Promise<void> {
  const sw = (u.cmd.args[0] ?? "").toLowerCase().trim();
  const rest = u.util.stripSubs(u.cmd.args[1] ?? "").trim();

  if (sw === "learn") {
    if (!rest) {
      u.send("Usage: +contract/learn <name>");
      return;
    }
    await contractLearn(u, rest);
    return;
  }
  if (sw === "grant") {
    await contractGrant(u, rest);
    return;
  }

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
  if (sw === "loophole" || sw === "catch") {
    if (!rest) {
      u.send("Usage: +contract/loophole <name>");
      return;
    }
    await contractInvoke(u, sheet, rest, true);
    return;
  }

  // +contract <full name>  or  +contract/<Name> (single token)
  const name = rest || sw;
  await contractInvoke(u, sheet, name);
}

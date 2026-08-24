/**
 * Spell effect resolution for +cast.
 */
import type { IDBObj, IUrsamuSDK } from "@ursamu/ursamu";
import {
  getAbilityMod,
  getProficiencyBonus,
  migrateSheet,
  type DndAbility,
  type DndSheet,
} from "../stats/dnd_sheet.ts";
import { applyDamage, applyHeal } from "../stats/vitality.ts";
import { checkConcentration } from "../stats/concentration.ts";
import {
  addCondition,
  attackRollAdv,
} from "../stats/conditions.ts";
import {
  rollD20Adv,
  spellcastingAbility,
} from "../stats/rules.ts";
import type { SpellEntry } from "../data/catalog.ts";
import { dndEncounterStore } from "../combat/ports.ts";
import { computeAc } from "../combat/resolve.ts";

function parseDie(
  formula: string,
): { count: number; sides: number; bonus: number } | null {
  const m = formula.trim().match(
    /^(\d+)[dD](\d+)(?:\s*([+-])\s*(\d+))?$/,
  );
  if (!m) return null;
  const bonus = m[4]
    ? (m[3] === "-" ? -1 : 1) * parseInt(m[4], 10)
    : 0;
  return {
    count: parseInt(m[1], 10),
    sides: parseInt(m[2], 10),
    bonus,
  };
}

export function rollFormula(
  formula: string,
  mult = 1,
): { total: number; detail: string } {
  const flat = formula.trim().match(/^(\d+)$/);
  if (flat) {
    const n = parseInt(flat[1], 10) * mult;
    return { total: n, detail: String(n) };
  }
  const die = parseDie(formula);
  if (!die) return { total: 0, detail: formula };
  const rolls: number[] = [];
  let sum = 0;
  const n = die.count * mult;
  for (let i = 0; i < n; i++) {
    const r = Math.floor(Math.random() * die.sides) + 1;
    rolls.push(r);
    sum += r;
  }
  const total = Math.max(0, sum + die.bonus);
  const b = die.bonus
    ? (die.bonus >= 0 ? `+${die.bonus}` : `${die.bonus}`)
    : "";
  return {
    total,
    detail: `${n}d${die.sides}(${rolls.join(", ")})${b}`,
  };
}

async function saveTarget(
  u: IUrsamuSDK,
  target: IDBObj,
  sheet: DndSheet,
): Promise<void> {
  await u.db.modify(target.id, "$set", { "data.dnd": sheet });
  // deno-lint-ignore no-explicit-any
  (target.state as any).dnd = sheet;
  if (
    sheet.death?.dead &&
    target.flags?.has?.("player") &&
    sheet.class !== "Monster"
  ) {
    try {
      const { maybeProcessPlayerDeath } = await import(
        "../stats/player-death.ts"
      );
      await maybeProcessPlayerDeath(u, target, sheet);
    } catch {
      /* death travel optional */
    }
  }
}

async function markOut(
  encId: string | undefined,
  target: IDBObj,
  sheet: DndSheet,
): Promise<void> {
  if (!encId) return;
  if (sheet.hp.current > 0 && !sheet.death?.dead) return;
  await dndEncounterStore.patchParticipant(
    encId,
    target.id,
    { isOut: true },
  );
}

function targetSheetOf(target: IDBObj): DndSheet {
  // deno-lint-ignore no-explicit-any
  return migrateSheet((target.state as any)?.dnd);
}

export async function resolveSpell(
  u: IUrsamuSDK,
  spell: SpellEntry,
  caster: DndSheet,
  targetObj: IDBObj,
  nameA: string,
  nameT: string,
  encId?: string,
): Promise<void> {
  const targetSheet = targetSheetOf(targetObj);
  const ab = spellcastingAbility(caster);
  const mod = getAbilityMod(caster.abilities[ab] ?? 10);
  const prof = getProficiencyBonus(caster.level ?? 1);
  const abLabel = ab.slice(0, 3).toUpperCase();

  if (spell.healing) {
    const { total, detail } = rollFormula(spell.healing);
    const addMod = spell.healing.includes("d");
    const healAmt = total + (addMod ? mod : 0);
    const healed = applyHeal(targetSheet, healAmt);
    await saveTarget(u, targetObj, healed.sheet);
    const modBit = addMod ? `+${mod} (${abLabel}) ` : "";
    u.broadcast(
      `${nameA} casts %ch${spell.name}%cn ` +
        `on ${nameT}: ${detail}${modBit}= ` +
        `%ch%cg${healAmt}%cn HP ` +
        `(${healed.sheet.hp.current}/${healed.sheet.hp.max}).`,
    );
    return;
  }

  if (spell.tempHp && !spell.attack && !spell.save && !spell.damage) {
    const { total, detail } = rollFormula(spell.tempHp);
    const amt = Math.max(0, total);
    let next = structuredClone(targetSheet) as typeof targetSheet;
    next.hp.temp = Math.max(next.hp.temp || 0, amt);
    if (spell.concentration) {
      // caster already set conc in cast.ts
    }
    await saveTarget(u, targetObj, next);
    u.broadcast(
      `${nameA} casts %ch${spell.name}%cn` +
        (targetObj.id !== u.me.id ? ` on ${nameT}` : "") +
        `: ${detail} = %ch%cg${amt}%cn temp HP ` +
        `(temp ${next.hp.temp}).`,
    );
    return;
  }

  if (spell.onCastCondition && !spell.attack && !spell.save) {
    const r = addCondition(targetSheet, spell.onCastCondition);
    await saveTarget(u, targetObj, r.sheet);
    const tag = r.entry?.name ?? spell.onCastCondition;
    u.broadcast(
      `${nameA} casts %ch${spell.name}%cn ` +
        `on ${nameT} — now %ch${tag}%cn.` +
        (spell.concentration ? " (concentrating)" : ""),
    );
    return;
  }

  if (spell.autoHit && spell.damage) {
    const { total, detail } = rollFormula(spell.damage);
    const dmg = applyDamage(targetSheet, total);
    const conc = checkConcentration(dmg.sheet, total);
    await saveTarget(u, targetObj, conc.sheet);
    u.broadcast(
      `${nameA} casts %ch${spell.name}%cn ` +
        `at ${nameT}: ${detail} = %ch%cy${total}%cn ` +
        `${spell.damageType || "force"} ` +
        `(${conc.sheet.hp.current}/${conc.sheet.hp.max}).`,
    );
    for (const line of conc.lines) {
      u.broadcast(`${line}`);
    }
    await markOut(encId, targetObj, conc.sheet);
    return;
  }

  if (spell.attack && spell.damage) {
    await castAttackSpell(
      u, spell, caster, targetObj, targetSheet,
      nameA, nameT, mod, prof, abLabel, encId,
    );
    return;
  }

  if (spell.save) {
    await castSaveSpell(
      u, spell, caster, targetObj, targetSheet,
      nameA, nameT, mod, prof, encId,
    );
    return;
  }

  u.broadcast(
    `${nameA} casts %ch${spell.name}%cn` +
      (targetObj.id !== u.me.id ? ` on ${nameT}` : "") +
      "!" +
      (spell.concentration ? " (concentrating)" : ""),
  );
}

async function castAttackSpell(
  u: IUrsamuSDK,
  spell: SpellEntry,
  caster: DndSheet,
  targetObj: IDBObj,
  targetSheet: DndSheet,
  nameA: string,
  nameT: string,
  mod: number,
  prof: number,
  abLabel: string,
  encId?: string,
): Promise<void> {
  const ranged = spell.attack === "ranged";
  const adv = attackRollAdv(caster, targetSheet, { ranged });
  const { roll, detail } = rollD20Adv(adv);
  const total = roll + mod + prof;
  const ac = await computeAc(u, targetObj);
  const isCrit = roll === 20;
  const hit = isCrit || (roll !== 1 && total >= ac);

  if (!hit) {
    u.broadcast(
      `${nameA} casts %ch${spell.name}%cn ` +
        `at ${nameT}: ${detail}+${mod}+${prof}=${total} ` +
        `vs AC ${ac}. %ch%cyMISS%cn.`,
    );
    return;
  }

  const { total: dmgRoll, detail: dmgDetail } = rollFormula(
    spell.damage!,
    isCrit ? 2 : 1,
  );
  const dmg = applyDamage(targetSheet, dmgRoll, {
    critical: isCrit,
  });
  const conc = checkConcentration(dmg.sheet, dmgRoll);
  await saveTarget(u, targetObj, conc.sheet);

  const hitLabel = isCrit
    ? "%ch%crCRITICAL HIT!%cn"
    : "%ch%cgHIT%cn!";
  let hpState = "";
  if (conc.sheet.death?.dead) hpState = " -- %crDEAD%cn!";
  else if (conc.sheet.hp.current === 0) {
    hpState = " -- %crUnconscious%cn!";
  }

  u.broadcast(
    `${nameA} casts %ch${spell.name}%cn at ` +
      `${nameT}: ${detail}+${mod}+${prof}=${total} vs AC ` +
      `${ac}. ${hitLabel}`,
  );
  u.broadcast(
    `${dmgDetail} = %ch%cy${dmgRoll}%cn ` +
      `${spell.damageType || "damage"} (${abLabel}) to ` +
      `${nameT} (${conc.sheet.hp.current}/${conc.sheet.hp.max})` +
      `${hpState}`,
  );
  for (const line of conc.lines) {
    u.broadcast(`${line}`);
  }
  await markOut(encId, targetObj, conc.sheet);
}

async function castSaveSpell(
  u: IUrsamuSDK,
  spell: SpellEntry,
  caster: DndSheet,
  targetObj: IDBObj,
  targetSheet: DndSheet,
  nameA: string,
  nameT: string,
  mod: number,
  prof: number,
  encId?: string,
): Promise<void> {
  const saveAb = (spell.save || "dexterity") as DndAbility;
  const saveMod = getAbilityMod(
    targetSheet.abilities[saveAb] ?? 10,
  );
  const isProf = (targetSheet.savingThrowProficiency ?? [])
    .includes(saveAb);
  const saveProf = isProf
    ? getProficiencyBonus(targetSheet.level ?? 1)
    : 0;
  const dc = 8 + mod + prof;
  const { roll, detail } = rollD20Adv("normal");
  const saveTotal = roll + saveMod + saveProf;
  const passed = saveTotal >= dc;

  u.broadcast(
    `${nameA} casts %ch${spell.name}%cn ` +
      `on ${nameT} (DC ${dc} ` +
      `${saveAb.slice(0, 3).toUpperCase()}): ${detail}+` +
      `${saveMod}` +
      (saveProf ? `+${saveProf}` : "") +
      `=${saveTotal} — ` +
      `${passed ? "%ch%cgSAVE%cn" : "%ch%crFAIL%cn"}.`,
  );

  let next = targetSheet;
  if (spell.damage) {
    const { total, detail: dd } = rollFormula(spell.damage);
    let dealt = total;
    if (passed) {
      if (!spell.halfOnSave) return;
      dealt = Math.floor(total / 2);
    }
    if (dealt > 0) {
      const dmg = applyDamage(next, dealt);
      const conc = checkConcentration(dmg.sheet, dealt);
      next = conc.sheet;
      u.broadcast(
        `${dd} = %ch%cy${dealt}%cn ` +
          `${spell.damageType || "damage"}` +
          (passed ? " (half)" : "") +
          ` (${next.hp.current}/${next.hp.max}).`,
      );
      for (const line of conc.lines) {
        u.broadcast(`${line}`);
      }
    }
  } else if (passed) {
    return;
  }
  if (!passed && spell.onFailCondition) {
    const r = addCondition(next, spell.onFailCondition);
    next = r.sheet;
    u.broadcast(
      `${nameT} is now ` +
        `%ch${r.entry?.name ?? spell.onFailCondition}%cn.`,
    );
  }
  await saveTarget(u, targetObj, next);
  await markOut(encId, targetObj, next);
}

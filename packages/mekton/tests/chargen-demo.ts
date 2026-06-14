/**
 * chargen-demo.ts -- Full chargen walkthrough, printed to stdout.
 * Run:  deno task demo
 */

import { derivedStats, skillPointsSpent } from "../derived.ts";
import { HARD_SKILLS } from "../validation.ts";
import { rollBasicLifepath, rollProfessionalEvent } from "../lifepath.ts";
import { findProfession } from "../professions.ts";
import { findGearByName } from "../catalog.ts";
import { combatStatus, LOCATION_LABELS, applyDamage } from "../combat.ts";
import { rollInterlock, difficultyLabel } from "../roll.ts";
import { mektonSystem } from "../game-system.ts";
import type { IMektonChar, IMektonStats, IEquipmentItem, WoundLocation } from "../schema.ts";

// -- ANSI helpers --------------------------------------------------------------
const R    = "\x1b[0m";
const B    = (s: string) => `\x1b[1m${s}${R}`;
const DIM  = (s: string) => `\x1b[2m${s}${R}`;
const CY   = (s: string) => `\x1b[36m${s}${R}`;
const DCY  = (s: string) => `\x1b[2;36m${s}${R}`;
const BCY  = (s: string) => `\x1b[1;36m${s}${R}`;
const GR   = (s: string) => `\x1b[32m${s}${R}`;
const YL   = (s: string) => `\x1b[33m${s}${R}`;
const RD   = (s: string) => `\x1b[31m${s}${R}`;
const WH   = (s: string) => `\x1b[1;37m${s}${R}`;
const W    = 72;

// deno-lint-ignore no-control-regex
function stripAnsi(s: string) { return s.replace(/\x1b\[[0-9;]*m/g, ""); }

// ===[ LABEL ]=== section divider
function hr(label = "") {
  if (!label) { console.log(DCY("=".repeat(W))); return; }
  const tag   = ` ${label} `;
  const avail = W - tag.length;
  const left  = Math.floor(avail / 2);
  const right = avail - left;
  console.log(DCY("=".repeat(left)) + WH(tag) + DCY("=".repeat(right)));
}

function thin() { console.log(DIM("-".repeat(W))); }

// compact=true omits the leading blank line (for rapid sequences of commands)
function cmd(line: string, output: string[], compact = false) {
  if (!compact) console.log();
  console.log(`${DCY(">>")} ${BCY(line)}`);
  for (const o of output) console.log(`${CY("   >")} ${o}`);
}

// Fixed-width label + right-aligned value.  Total visible width = lw + vw.
function kv(label: string, value: string | number, lw = 14, vw = 4) {
  return `${DIM(label.padEnd(lw))}${YL(String(value).padStart(vw))}`;
}

// Row of kv cells separated by two spaces
function kvrow(...cells: string[]) {
  return "  " + cells.join("  ");
}

function pause() { console.log(); }

// -- Banner -------------------------------------------------------------------
pause();
console.log(DCY("///") + " " + BCY("MEKTON ZETA") + " " + WH("CHARGEN SIMULATOR") + " " + DIM("v0.1.0") + " " + DCY("///"));
thin();
pause();

// -- START CHARGEN ------------------------------------------------------------
hr("START CHARGEN");

cmd("+chargen/start", [GR("Chargen started.") + DIM("  Use +chargen/method to choose a stat generation method.")]);

const poolRolls = Array.from({ length: 10 }, () => Math.ceil(Math.random() * 10));
const pool      = Math.max(40, poolRolls.reduce((a, b) => a + b, 0));
cmd("+chargen/method concept", [
  `Concept method: rolled ${DIM("10D10")} = ${YL(String(pool))} point pool.`,
  DIM(`   Rolls: [${poolRolls.join(", ")}]`),
]);

// -- STATS --------------------------------------------------------------------
pause();
hr("SETTING STATS");

const stats: IMektonStats = { att: 6, bod: 7, cl: 7, emp: 6, int: 8, luck: 5, ma: 6, ref: 8, tech: 6, edu: 5 };
const statTotal = Object.values(stats).reduce((a, b) => a + b, 0);

let statSpent = 0;
for (const [k, v] of Object.entries(stats)) {
  statSpent += v;
  const rem = pool - statSpent;
  cmd(`+chargen/stat ${k}=${v}`, [
    `${BCY(k.toUpperCase().padEnd(5))} ${DIM("->")} ${YL(String(v))}    ${DIM("pool:")} ${rem >= 0 ? YL(String(rem)) : RD(String(rem))} ${DIM("remaining")}`,
  ], true);
}
console.log();
console.log(`  ${DIM("Total:")} ${YL(String(statTotal))}  ${DIM("/")}  ${DIM("Pool:")} ${YL(String(pool))}  ${statTotal <= pool ? GR("[+] within budget") : RD("[!] over budget")}`);

// -- Build char object --------------------------------------------------------
const char: IMektonChar = {
  id: "demo-id",
  playerId: "demo-player",
  playerName: "Yuki Tanaka",
  stats,
  skills: {},
  lifepath: {
    socialStatus: 0, startingCash: 0, parentStatus: "", familyStanding: "good",
    siblings: [], friends: [], enemies: [], romance: null,
    appearance: { hairColor: "", hairStyle: "", eyeColor: "", personalityTrait: "", valueMost: "", valuedPossession: "", valuedPerson: "" },
    professionalEvents: [],
  },
  charType: "professional",
  rookieTemplate: null,
  careers: [],
  age: 16,
  equipment: [],
  cash: 0,
  statMethod: "concept",
  statPointPool: pool,
  chargenStatus: "draft",
  wounds: { head: 0, torso: 0, rArm: 0, lArm: 0, rLeg: 0, lLeg: 0 },
  stunned: false,
  luckRemaining: stats.luck,
  firstAidApplied: {},
};

// -- DERIVED STATS ------------------------------------------------------------
pause();
hr("DERIVED STATS");

const d = derivedStats(char);
pause();
// 4-column rows: lw=10, vw=4 = 14 chars/cell, 2-space gaps => 4*14+3*2+2=66 chars
console.log(kvrow(
  kv("Head HP:", `${d.headHp}H`,    10, 4),
  kv("Torso HP:", `${d.torsoHp}H`,  10, 4),
  kv("Limbs HP:", `${d.limbHp}H`,   10, 4),
  kv("Stun:", d.stun,               10, 4),
));
console.log(kvrow(
  kv("Stability:", d.stability,     10, 4),
  kv("Lift:", `${d.lift}kg`,        10, 4),
  kv("Throw:", `${d.throwM}m`,      10, 4),
  kv("DmgBonus:", d.dmgBonus >= 0 ? `+${d.dmgBonus}` : String(d.dmgBonus), 10, 4),
));
console.log(kvrow(
  kv("EV:", d.ev,                   10, 4),
  kv("Skill Pts:", d.skillPoints,   10, 4),
));
console.log(`  ${DIM("(INT")} ${YL(String(stats.int))} ${DIM("+ EDU")} ${YL(String(stats.edu))} ${DIM("+ 10)")}`);

// -- SKILLS -------------------------------------------------------------------
pause();
hr("SKILLS");

const chosenSkills: Record<string, number> = {
  "Mecha Piloting":    5,
  "Mecha Gunnery":     4,
  "Mecha Fighting":    3,
  "Handgun":           4,
  "Awareness/Notice":  4,
  "Dodge & Escape":    3,
  "Stealth":           2,
  "Survival":          2,
  "First Aid":         2,
  "Basic Repair":      2,
};

let skillSpent = 0;
for (const [sk, lv] of Object.entries(chosenSkills)) {
  const isHard  = HARD_SKILLS.has(sk);
  const overCap = isHard && lv > 5;
  const cost    = lv <= 5 ? lv : 5 + (lv - 5) * 2;
  skillSpent   += cost;
  const rem     = d.skillPoints - skillSpent;
  const hardTag = isHard ? DIM(" [H]") : "";
  const lvLabel = overCap ? RD(`+${lv} OVER HARD CAP`) : `${DIM("+")}${YL(String(lv))}`;
  cmd(`+chargen/skill ${sk}=${lv}`,
    [`${CY(sk)}${hardTag}  ${lvLabel}  ${DIM(`(${cost} pts)`)}    ${DIM("remaining:")} ${rem >= 0 ? YL(String(rem)) : RD(String(rem))}`],
    true,
  );
}

char.skills = { ...chosenSkills };
const spent = skillPointsSpent(char.skills);
console.log();
console.log(
  `  ${DIM("Budget:")} ${YL(String(d.skillPoints))}  ${DIM("Spent:")} ${YL(String(spent))}  ` +
  (spent <= d.skillPoints ? GR(`Remaining: ${d.skillPoints - spent}`) : RD(`OVER by ${spent - d.skillPoints}`)),
);

// -- LIFEPATH -----------------------------------------------------------------
pause();
hr("LIFEPATH");

cmd("+chargen/roll-lifepath", [DIM("Rolling all basic lifepath charts...")]);
const lp = rollBasicLifepath();
char.lifepath = {
  ...char.lifepath,
  socialStatus:   lp.socialStatus   ?? 7,
  startingCash:   lp.startingCash   ?? 700,
  parentStatus:   lp.parentStatus   ?? "Both parents alive.",
  familyStanding: lp.familyStanding ?? "good",
  familyCrisis:   lp.familyCrisis,
  familialGoal:   lp.familialGoal,
  siblings:   lp.siblings   ?? [],
  friends:    lp.friends    ?? [],
  enemies:    lp.enemies    ?? [],
  romance:    lp.romance    ?? null,
  appearance: lp.appearance ?? char.lifepath.appearance,
};
char.cash = char.lifepath.startingCash;

console.log();
console.log(kvrow(kv("Social Status:", char.lifepath.socialStatus, 16, 4), kv("Starting Cash:", `\xa5${char.lifepath.startingCash}`, 16, 5)));
console.log(`  ${DIM("Parents:")} ${char.lifepath.parentStatus}`);
console.log(`  ${DIM("Family:")} ${char.lifepath.familyStanding}${char.lifepath.familyCrisis ? DIM("  --  ") + char.lifepath.familyCrisis : ""}`);
if (char.lifepath.familialGoal) console.log(`  ${DIM("Goal:")} ${char.lifepath.familialGoal}`);
console.log(kvrow(kv("Siblings:", char.lifepath.siblings.length, 12, 3), kv("Friends:", char.lifepath.friends.length, 12, 3), kv("Enemies:", char.lifepath.enemies.length, 12, 3)));
if (char.lifepath.romance) console.log(`  ${DIM("Romance:")} ${char.lifepath.romance.status}${char.lifepath.romance.detail ? DIM("  --  ") + char.lifepath.romance.detail : ""}`);
const ap = char.lifepath.appearance;
if (ap.hairColor) console.log(`  ${DIM("Hair:")} ${ap.hairColor}, ${ap.hairStyle}  ${DIM("Eyes:")} ${ap.eyeColor}  ${DIM("Trait:")} ${ap.personalityTrait}`);
if (ap.valueMost) console.log(`  ${DIM("Values:")} ${ap.valueMost}  ${DIM("Possession:")} ${ap.valuedPossession}  ${DIM("Person:")} ${ap.valuedPerson}`);

// -- CHARACTER TYPE -----------------------------------------------------------
pause();
hr("CHARACTER TYPE: PROFESSIONAL");

cmd("+chargen/type professional", [GR("Type set to ") + BCY("Professional") + DIM(".  Use +chargen/career/list to see professions.")]);

const careerDefs = [
  { name: "Pilot/Non-Combat",  picks: ["Mecha Piloting", "Awareness/Notice", "Zero Gee", "Basic Repair", "Expert: Navigation"] },
  { name: "Mechajock/Combat",  picks: ["Mecha Gunnery", "Handgun", "Mecha Fighting", "Mecha Piloting", "Awareness/Notice"] },
];

for (let i = 0; i < careerDefs.length; i++) {
  const def      = careerDefs[i];
  const prof     = findProfession(def.name)!;
  const bonus    = Math.ceil(Math.random() * 10) + Math.ceil(Math.random() * 10);
  const startAge = 16 + i * 2;

  cmd(`+chargen/career ${prof.name}`, [
    `${DIM(`Term ${i + 1}:`)} ${BCY(prof.name)}  ${DIM(`(age ${startAge}-${startAge + 2})`)}  ${YL(`+\xa5${bonus}`)}`,
    DIM(`   Select 5 skills: +chargen/career/skills ${i + 1}=<s1>,...`),
  ]);
  cmd(`+chargen/career/skills ${i + 1}=${def.picks.join(",")}`, [
    GR(`Term ${i + 1} skills set.`) + DIM("  +1 to each chosen skill."),
  ], true);

  for (const sk of def.picks) char.skills[sk] = (char.skills[sk] ?? 0) + 1;

  const ev = rollProfessionalEvent(prof.dangerous);
  char.lifepath.professionalEvents.push({
    term: i + 1, profession: prof.name, dangerous: prof.dangerous,
    event: ev.event, detail: ev.detail, accidentEffect: ev.accidentEffect,
  });
  char.careers.push({ profession: prof.name, dangerous: prof.dangerous, chosenSkills: def.picks, equipmentBonus: bonus });
  char.cash += bonus;
}
char.age = 16 + char.careers.length * 2;

console.log();
console.log(`  ${DIM("Age after careers:")} ${YL(String(char.age))}`);
for (const ev of char.lifepath.professionalEvents) {
  console.log(`  ${DCY("|")}  ${DIM(`Term ${ev.term} (${ev.profession}):`)} ${YL(ev.event)} ${DIM("--")} ${ev.detail}`);
}

// -- GEAR ---------------------------------------------------------------------
pause();
hr("GEAR");

const purchases = ["Combat Pistol", "Medium Helmet", "Light Ballistic Mesh", "Combat Knife"];
for (const itemName of purchases) {
  const item = findGearByName(itemName)!;
  if (char.cash >= item.cost) {
    char.equipment.push(item);
    char.cash -= item.cost;
    cmd(`+gear/buy ${itemName}`, [`${BCY(item.name)}  ${YL(`\xa5${item.cost}`)}  ${DIM("remaining:")} ${YL(`\xa5${char.cash}`)}`], true);
  }
}

const pilotSuit: IEquipmentItem = { name: "Pilot's Suit", category: "clothing", weight: 2.0, cost: 300 };
char.equipment.push(pilotSuit);
char.cash -= 300;
cmd("+gear/add Pilot's Suit=2,300", [GR("Added ") + BCY("Pilot's Suit") + DIM("  2.0kg  \xa5300")]);

cmd("+encumbrance", []);
const totalWeight = char.equipment.reduce((s, i) => s + i.weight, 0);
const d2  = derivedStats(char);
const load  = Math.floor(totalWeight / d2.ev);
const effMA = Math.max(0, char.stats.ma - load);
console.log(kvrow(
  kv("Weight:", `${totalWeight.toFixed(1)}kg`, 10, 6),
  kv("EV:", d2.ev, 6, 3),
  kv("Load:", load, 8, 3),
  DIM("MA:") + " " + YL(String(char.stats.ma)) + " " + DCY("->") + " " + DIM("Eff.MA:") + " " + YL(String(effMA)),
));

// -- INITIALIZE WOUNDS --------------------------------------------------------
char.wounds = { head: d2.headHp, torso: d2.torsoHp, rArm: d2.limbHp, lArm: d2.limbHp, rLeg: d2.limbHp, lLeg: d2.limbHp };

// -- SUBMIT -------------------------------------------------------------------
pause();
hr("SUBMIT");

char.chargenStatus = "submitted";
cmd("+chargen/submit", [GR("Submitted.") + DIM("  Staff will review your sheet shortly.")]);
char.chargenStatus = "approved";
char.approvedAt    = Date.now();
cmd("+chargen/approve Yuki Tanaka", [GR("[+] ") + BCY(B("Yuki Tanaka")) + GR(" approved and locked.")], true);

// RP demo fields (would come from chargen form in prod)
const concept     = "Freelance Mecha Pilot";
const apparentAge = char.age;

// -- FULL SHEET ---------------------------------------------------------------
pause();
hr("+sheet");
pause();

function sheetCenter(s: string, w: number, ch = "=") {
  const clean = stripAnsi(s);
  const total = w - clean.length;
  const l     = Math.floor(total / 2);
  const r     = total - l;
  return ch.repeat(l) + s + ch.repeat(r);
}

// Centered section divider:  ------- LABEL -------
function sectionHead(label: string) {
  const tag   = ` ${label} `;
  const avail = W - tag.length;
  const l     = Math.floor(avail / 2);
  const r     = avail - l;
  return DIM("-".repeat(l)) + WH(tag) + DIM("-".repeat(r));
}

// Two-column row split at LCOL, no leading indent, no separator
const LCOL = 36;
function row2col(left: string, right: string) {
  const pad = " ".repeat(Math.max(0, LCOL - stripAnsi(left).length));
  return `${left}${pad}${right}`;
}

console.log(DCY(sheetCenter(` ${WH("MEKTON ZETA")} ${CY("CHARACTER SHEET")} `, W)));
pause();
console.log(row2col(DIM("Full Name:   ") + BCY(char.playerName),          DIM("Status:   ") + GR("APPROVED")));
console.log(row2col(DIM("Concept:     ") + WH(concept),                   DIM("Combat:   ") + combatStatus(char)));
console.log(row2col(DIM("Age:         ") + YL(String(char.age)) + DIM("   App.Age: ") + YL(String(apparentAge)), DIM("Type:     ") + DIM(`Professional  (${char.careers.length} terms)`)));

pause();
console.log(sectionHead("STATS"));
// 5-column: lw=5, vw=2 => 7 chars/cell, 2-space gaps => 5*7+4*2+2=45 chars
console.log(kvrow(kv("ATT", char.stats.att, 5, 2), kv("BOD", char.stats.bod, 5, 2), kv("CL", char.stats.cl, 5, 2), kv("EMP", char.stats.emp, 5, 2), kv("INT", char.stats.int, 5, 2)));
console.log(kvrow(kv("LUCK", char.stats.luck, 5, 2), kv("MA", char.stats.ma, 5, 2), kv("REF", char.stats.ref, 5, 2), kv("TECH", char.stats.tech, 5, 2), kv("EDU", char.stats.edu, 5, 2)));

pause();
console.log(sectionHead("DERIVED"));
// 4-column: lw=10, vw=4 => 14 chars/cell
console.log(kvrow(kv("Head HP:", `${d2.headHp}H`, 10, 4), kv("Torso HP:", `${d2.torsoHp}H`, 10, 4), kv("Limbs HP:", `${d2.limbHp}H`, 10, 4), kv("Stun:", d2.stun, 10, 4)));
console.log(kvrow(kv("Stability:", d2.stability, 10, 4), kv("Lift:", `${d2.lift}kg`, 10, 4), kv("Throw:", `${d2.throwM}m`, 10, 4), kv("DmgBonus:", d2.dmgBonus >= 0 ? `+${d2.dmgBonus}` : String(d2.dmgBonus), 10, 4)));
const spentFinal = skillPointsSpent(char.skills);
console.log(kvrow(kv("EV:", d2.ev, 10, 4), kv("Eff.MA:", effMA, 10, 4), kv("Skill Pts:", d2.skillPoints, 10, 4), kv("Luck:", `${char.luckRemaining}/${char.stats.luck}`, 10, 6)));
console.log(`  ${DIM(`skill pts: spent ${spentFinal}  remaining ${d2.skillPoints - spentFinal}`)}`);

pause();
console.log(sectionHead("SKILLS"));
console.log(`  ${DIM("(including career bonuses)")}`);
console.log();
const allSkills = Object.entries(char.skills).filter(([, v]) => v > 0).sort(([a], [b]) => a.localeCompare(b));
for (let i = 0; i < allSkills.length; i += 2) {
  const [sk1, lv1] = allSkills[i];
  const [sk2, lv2] = allSkills[i + 1] ?? ["", 0];
  const left  = `  ${CY(sk1.padEnd(26))} ${DIM("+")}${YL(String(lv1).padStart(2))}`;
  const right = sk2 ? `    ${CY(sk2.padEnd(26))} ${DIM("+")}${YL(String(lv2).padStart(2))}` : "";
  console.log(left + right);
}

pause();
console.log(sectionHead("CAREER HISTORY"));
console.log();
for (const term of char.careers) {
  const idx      = char.careers.indexOf(term) + 1;
  const startAge = 14 + idx * 2;
  console.log(`  ${DCY(`Term ${idx}`)}  ${CY(term.profession.padEnd(24))}  ${DIM(`age ${startAge}-${startAge + 2}`)}`);
  console.log(`  ${DCY("|")}  ${DIM("Skills:")} ${term.chosenSkills.map((s) => CY(s)).join(DIM(", "))}`);
}

pause();
console.log(sectionHead("LIFEPATH"));
console.log();
console.log(kvrow(kv("Social Status:", char.lifepath.socialStatus, 15, 3), kv("Starting Cash:", `\xa5${char.lifepath.startingCash}`, 15, 5)));
console.log(`  ${DIM("Family:")} ${char.lifepath.parentStatus} ${DIM("--")} ${char.lifepath.familyStanding === "good" ? GR("Good Standing") : RD("Bad Standing")}`);
console.log(kvrow(kv("Siblings:", char.lifepath.siblings.length, 12, 2), kv("Friends:", char.lifepath.friends.length, 12, 2), kv("Enemies:", char.lifepath.enemies.length, 12, 2)));
if (char.lifepath.romance) console.log(`  ${DIM("Romance:")} ${char.lifepath.romance.status}`);

pause();
console.log(sectionHead("WOUNDS"));
console.log();
// 2 wounds per row with HP bar — bar padded to torsoHp width so values line up
const woundLocs = Object.keys(char.wounds) as WoundLocation[];
const barW = d2.torsoHp; // widest possible bar (torso always largest)
for (let i = 0; i < woundLocs.length; i += 2) {
  const woundCell = (loc: WoundLocation) => {
    const label = LOCATION_LABELS[loc];
    const max   = loc === "head" ? d2.headHp : loc === "torso" ? d2.torsoHp : d2.limbHp;
    const cur   = char.wounds[loc];
    const bar   = GR("#".repeat(cur)) + DIM(".".repeat(max - cur)) + " ".repeat(barW - max);
    return `${DIM(label.padEnd(10))} ${bar}  ${YL(String(cur).padStart(2))}${DIM(`/${max}`)}`;
  };
  const loc1 = woundLocs[i];
  const loc2 = woundLocs[i + 1];
  console.log(`  ${woundCell(loc1)}    ${loc2 ? woundCell(loc2) : ""}`);
}

pause();
console.log(sectionHead("EQUIPMENT"));
console.log(`  ${DIM(`\xa5${char.cash} remaining`)}`);
console.log();
for (const item of char.equipment) {
  const spInfo  = item.sp     ? `  ${DIM("SP:")}${YL(String(item.sp))}` : "";
  const dmgInfo = item.damage ? `  ${DIM("Dmg:")}${YL(item.damage)}`    : "";
  console.log(`  ${CY(item.name.padEnd(26))}  ${DIM(`${item.weight}kg`.padStart(7))}  ${YL(`\xa5${item.cost}`.padStart(7))}${dmgInfo}${spInfo}`);
}

console.log();
console.log(DCY("=".repeat(W)));

// -- DICE ROLLER DEMO ---------------------------------------------------------
pause();
hr("+roll DEMO");

const rollDemos: Array<{ stat: keyof IMektonStats; skill: string; dn?: number }> = [
  { stat: "ref", skill: "Mecha Piloting",   dn: 20 },
  { stat: "ref", skill: "Mecha Gunnery",    dn: 15 },
  { stat: "ref", skill: "Handgun",          dn: 15 },
  { stat: "int", skill: "Awareness/Notice", dn: 10 },
  { stat: "ref", skill: "Dodge & Escape" },
];

for (const demo of rollDemos) {
  const sv      = char.stats[demo.stat];
  const sk      = char.skills[demo.skill] ?? 0;
  const result  = rollInterlock(sv, sk);
  const success = demo.dn !== undefined ? result.total >= demo.dn : undefined;
  const critLabel = result.critical === "success" ? YL(" * CRITICAL SUCCESS") : result.critical === "failure" ? RD(" ! CRITICAL FAILURE") : "";
  const dnLabel   = demo.dn
    ? ` ${DIM("vs")} ${difficultyLabel(demo.dn)} ${DCY("->")} ${success ? GR("SUCCESS") : RD("FAIL")}`
    : "";
  cmd(
    `+roll ${demo.stat}+${demo.skill}${demo.dn ? `/${demo.dn}` : ""}`,
    [`${DIM(`${demo.stat.toUpperCase()}(${sv})`)} ${DCY("+")} ${DIM(`${demo.skill}(${sk})`)} ${DCY("+")} ${DIM("1D10")} ${DCY("[")}${DIM(result.chainRolls.join("->"))}${DCY("]")} ${DCY("=")} ${YL(B(String(result.total)))}${critLabel}${dnLabel}`],
    true,
  );
}

// -- COMBAT DEMO --------------------------------------------------------------
pause();
hr("COMBAT DEMO");

const testChar = { ...char, wounds: { ...char.wounds } };
const loc: WoundLocation = "torso";
const rawDmg  = 8;
const sp      = 12;
const applied = Math.max(0, rawDmg - sp);

cmd("+attack Yuki Tanaka=Assault Rifle", [
  `${DIM("Attack")} ${YL("18")} ${DIM("vs Defence")} ${YL("14")} ${DCY("->")} ${GR("HIT")} ${DIM(`(${LOCATION_LABELS[loc]})`)}.`,
  `${DIM("Damage:")} ${YL(String(rawDmg))} ${DIM("raw")} ${DCY("-")} ${YL(String(sp))} ${DIM("SP")} ${DCY("=")} ${applied > 0 ? RD(String(applied)) : YL("0")} ${DIM("applied")}.`,
  applied === 0 ? GR("Armor fully absorbed the hit.") : RD(`${applied} damage applied to ${LOCATION_LABELS[loc]}.`),
]);

if (applied > 0) {
  applyDamage(testChar.wounds, loc, applied);
  console.log(`  ${DCY("|")}  ${LOCATION_LABELS[loc]} HP: ${YL(String(testChar.wounds[loc]))}${DIM(`/${d2.torsoHp}`)}  Status: ${combatStatus(testChar)}`);
}

cmd("+luck/spend 2", [`${DIM("Spent")} ${YL("2")} ${DIM("Luck.")}  ${DCY("+")}2 to last roll.  ${DIM("Remaining:")} ${YL(`${char.luckRemaining - 2}/${char.stats.luck}`)}`], true);
cmd("+heal torso", [
  `${DIM("First Aid:")} ${DIM(`TECH(${char.stats.tech})`)} ${DCY("+")} ${DIM(`First Aid(${char.skills["First Aid"] ?? 0})`)} ${DCY("+")} ${DIM("1D10")} ${DCY("=")} ${YL(String(rollInterlock(char.stats.tech, char.skills["First Aid"] ?? 0).total))}.`,
  GR("[+] Healed 4 hits on Torso.") + `  ${DIM("HP:")} ${YL(String(Math.min(d2.torsoHp, testChar.wounds[loc] + 4)))}${DIM(`/${d2.torsoHp}`)}`,
], true);

// -- AI GM CONTEXT ------------------------------------------------------------
pause();
hr("AI GM CONTEXT BLOCK");
console.log(`  ${DIM("(injected into GM system prompt for the LLM)")}`);
pause();
console.log(DIM(mektonSystem.formatCharacterContext(char as unknown as Record<string, unknown>)));
pause();
console.log(kvrow(
  DIM("System:") + " " + CY(mektonSystem.id),
  DIM("Full Success:") + " " + YL(String(mektonSystem.moveThresholds.fullSuccess)),
  DIM("Partial:") + " " + YL(String(mektonSystem.moveThresholds.partialSuccess)),
));

// -- DONE ---------------------------------------------------------------------
pause();
hr("DONE");
console.log(`  ${GR("[+]")}  All P1-P11 systems exercised for ${BCY(char.playerName)}.`);
console.log();

Deno.exit(0);

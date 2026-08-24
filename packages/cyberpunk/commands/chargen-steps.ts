/**
 * +chargen -- Step Handlers
 */
import type { IUrsamuSDK } from "@ursamu/ursamu";
import type { ICPRCharacter, Role, StatKey } from "../db/schemas.ts";
import { ROLES, getRole } from "../data/roles.ts";
import { SKILLS } from "../data/skills.ts";
import { LIFESTYLES } from "../data/lifestyles.ts";
import {
  CYBERWARE_CATALOG,
  displayCyberName,
} from "../data/cyberware.ts";
import { WEAPONS } from "../data/weapons.ts";
import { ARMOR_CATALOG } from "../data/armor.ts";
import { buildNewCharacter, CHARGEN_STAT_MAX, CHARGEN_STAT_MIN, CHARGEN_POINTS } from "../engine/character.ts";
import { CAREER_SKILLS } from "../engine/chargen-constants.ts";
import {
  applyLifestyle,
  applyRole,
  CHARGEN_SKILL_POINTS,
  installChrome,
  removeChrome,
  skillPointsSpent,
} from "../engine/chargen-ops.ts";
import { STARTING_EB } from "../engine/chargen-constants.ts";
import { effectiveHL } from "../engine/cyberware-install.ts";
import { bar, div, hdr, lbl, val, acc, dim, ARR, ERR, OK, row, wrap, grid, tbl, stageHeader, stageRollResult, stageDetailLines, W } from "./chargen.ts";

const STAT_KEYS: StatKey[] = ["int", "ref", "dex", "tech", "cool", "will", "luck", "move", "body", "emp"];

// --- Handlers ----------------------------------------------------------------

export async function handleMethod(u: IUrsamuSDK, cpr: ICPRCharacter, arg: string): Promise<void> {
  if (cpr.chargenStage !== "method") {
    u.send(`${ERR}Not currently at the method stage. Type ${val("+chargen")} to check your stage.`);
    return;
  }
  const method = arg.toLowerCase();
  if (
    method !== "streetrat" &&
    method !== "edgerunner" &&
    method !== "complete"
  ) {
    u.send([
      `${ERR}Invalid method. Choose one:`,
      `    ${val("+chargen/method streetrat")}  ${dim("-- book STAT+skill templates")}`,
      `    ${val("+chargen/method edgerunner")} ${dim("-- roll STATs; 86 skill pts")}`,
      `    ${val("+chargen/method complete")}   ${dim("-- full 62/86 point-buy")}`,
    ].join("\r\n"));
    return;
  }
  await u.db.modify(u.me.id, "$set", {
    "state.cpr.chargenMethod":   method,
    "state.cpr.chargenStatPool": method === "complete" ? CHARGEN_POINTS : 0,
    "state.cpr.chargenSkillPool": 86,
    "state.cpr.chargenStage":    "role_select",
  });
  const updated = {
    ...cpr,
    chargenMethod: method as "streetrat" | "edgerunner" | "complete",
    chargenStage: "role_select" as const,
  };
  u.send([
    ...stageHeader(updated),
    `  ${OK}Method locked: ${val(method.toUpperCase())}`,
    div(),
    `  ${ARR}Now choose your role:`,
    `    ${val("+chargen/role <role>")}`,
    "",
    `  ${dim("Available roles:")}`,
    ...grid(ROLES.map((r) => acc(r.name)), 4, "    "),
    bar(),
  ].join("\r\n"));
}

export async function handleRole(u: IUrsamuSDK, cpr: ICPRCharacter, arg: string): Promise<void> {
  if (cpr.chargenStage !== "role_select") {
    u.send(`${ERR}Not currently at the role stage. Type ${val("+chargen")} to check your stage.`);
    return;
  }
  const roleName = arg.toLowerCase() as Role;
  const roleDef  = ROLES.find((r) => r.name === roleName);
  if (!roleDef) {
    u.send([
      `${ERR}Unknown role. Valid roles:`,
      ...grid(ROLES.map((r) => acc(r.name)), 4, "    "),
    ].join("\r\n"));
    return;
  }

  // Shared seeder: Role package skills default to 2 + pool math
  const res = applyRole(cpr, roleName);
  if (!res.ok) {
    u.send(`${ERR}${res.error}`);
    return;
  }
  await u.db.modify(u.me.id, "$set", { "state.cpr": res.draft });

  const updatedCpr = res.draft;
  const skillN = Object.keys(updatedCpr.skills ?? {}).length;
  u.send([
    ...stageHeader(updatedCpr),
    `  ${OK}Role locked: ${val(roleDef.displayName.toUpperCase())}`,
    row("ABILITY", `${acc(roleDef.abilityName)}  ${dim("rank 4 to start")}`),
    row(
      "SKILLS",
      updatedCpr.chargenMethod === "edgerunner"
        ? `${val("all Role skills @ 2")}  ${dim(`pool ${updatedCpr.chargenSkillPool ?? 0} left`)}`
        : `${val(String(skillN))} ${dim("seeded")}`,
    ),
    div(),
    ...wrap(roleDef.description, 74, "  "),
    div(),
    `  ${ARR}Set your lifepath.`,
    `    ${val("+chargen/set cultural_origin=<value>")}`,
    bar(),
  ].join("\r\n"));
}

export async function handleStat(u: IUrsamuSDK, cpr: ICPRCharacter, arg: string): Promise<void> {
  if (cpr.chargenStage !== "stats") {
    u.send(`${ERR}Not at the stats stage. Type ${val("+chargen")} to check your stage.`);
    return;
  }
  if (arg === "confirm" || arg === "next") {
    await u.db.modify(u.me.id, "$set", { "state.cpr.chargenStage": "skills" });
    const updatedCpr = { ...cpr, chargenStage: "skills" as const };
    u.send([
      ...stageHeader(updatedCpr),
      `  ${OK}Stats confirmed. Proceeding to skills.`,
      div(),
      `  ${ARR}Allocate ${val(`${cpr.chargenSkillPool ?? 86}`)} career skill points:`,
      `    ${val("+chargen/skill <skill>=<value>")}`,
      `    ${val("+chargen/next")}  ${dim("when done")}`,
      `  ${dim("Type")} ${val("+skills")} ${dim("to browse available skills.")}`,
      bar(),
    ].join("\r\n"));
    return;
  }
  if (cpr.chargenMethod !== "complete") {
    u.send(`${ERR}Stat allocation is only for the ${acc("Complete Package")} method.`);
    return;
  }

  // Support bulk: +chargen/stat ref=8 dex=6 ...
  const pairs = arg.match(/(\w+)=(\d+)/g) ?? [];
  if (!pairs.length) {
    u.send(`${ERR}Usage: ${val("+chargen/stat <stat>=<value>")}  or  ${val("+chargen/stat confirm")}`);
    return;
  }

  let pool    = cpr.chargenStatPool ?? 0;
  const lines: string[] = [];
  const updates: Record<string, unknown> = {};

  for (const pair of pairs) {
    const [statRaw, valRaw] = pair.split("=");
    const stat = (statRaw ?? "").toLowerCase().trim() as StatKey;
    const v    = parseInt(valRaw ?? "", 10);

    if (!STAT_KEYS.includes(stat)) { lines.push(`  ${ERR}Unknown stat: ${acc(stat)}`); continue; }
    if (isNaN(v) || v < CHARGEN_STAT_MIN || v > CHARGEN_STAT_MAX) {
      lines.push(`  ${ERR}${lbl(stat.toUpperCase())} must be ${dim(`${CHARGEN_STAT_MIN}-${CHARGEN_STAT_MAX}`)}`);
      continue;
    }
    const oldV  = (cpr.stats as unknown as Record<string, number>)[stat] ?? CHARGEN_STAT_MIN;
    const delta = v - oldV;
    if (pool - delta < 0) {
      lines.push(`  ${ERR}Not enough points for ${lbl(stat.toUpperCase())} ${dim(`(need ${delta}, have ${pool})`)}`);
      continue;
    }
    pool -= delta;
    updates[`state.cpr.stats.${stat}`] = v;
    if (stat === "emp") updates["state.cpr.stats.empBase"] = v;
    lines.push(`  ${OK}${lbl(stat.toUpperCase())}  ${dim("->")}  ${val(v)}`);
  }

  updates["state.cpr.chargenStatPool"] = pool;
  await u.db.modify(u.me.id, "$set", updates);
  lines.push(div());
  lines.push(row("POINTS REMAINING", val(`${pool}`)));
  lines.push(div());
  u.send(lines.join("\r\n"));
}

export async function handleSkill(u: IUrsamuSDK, cpr: ICPRCharacter, arg: string): Promise<void> {
  if (cpr.chargenStage !== "skills") {
    u.send(`${ERR}Not at the skills stage. Type ${val("+chargen")} to check your stage.`);
    return;
  }

  // Support bulk: +chargen/skill athletics=4 stealth=4 ...
  const pairs = arg.match(/(\w+)=(\d+)/g) ?? [];
  if (!pairs.length) {
    u.send(`${ERR}Usage: ${val("+chargen/skill <skill>=<value>")}`);
    return;
  }

  const method = cpr.chargenMethod;
  const career = CAREER_SKILLS[cpr.role as Role] ?? [];
  const lines: string[] = [];
  const skills = { ...(cpr.skills ?? {}) };

  for (const pair of pairs) {
    const [skillRaw, valRaw] = pair.split("=");
    const skillName = (skillRaw ?? "").toLowerCase().trim().replace(/ /g, "_");
    const v         = parseInt(valRaw ?? "", 10);

    const skillDef = SKILLS.find((s) => s.name === skillName);
    if (!skillDef) { lines.push(`  ${ERR}Unknown skill: ${acc(skillName)}`); continue; }
    if (isNaN(v) || v < 0 || v > 10) { lines.push(`  ${ERR}Skill value must be ${dim("0-10")}`); continue; }

    if (method === "edgerunner" && !career.includes(skillName)) {
      lines.push(`  ${ERR}${acc(skillName)} is not on your Role list.`);
      continue;
    }

    skills[skillName] = v;
    lines.push(`  ${OK}${lbl(skillName)}  ${dim("->")}  ${val(v)}`);
  }

  const billable = method === "edgerunner" ? career : null;
  const spent = skillPointsSpent(skills, billable);
  const pool = CHARGEN_SKILL_POINTS - spent;
  if (pool < 0) {
    u.send(
      `${ERR}Not enough skill points (would spend ${spent} of ${CHARGEN_SKILL_POINTS}).`,
    );
    return;
  }

  await u.db.modify(u.me.id, "$set", {
    "state.cpr.skills": skills,
    "state.cpr.chargenSkillPool": pool,
  });
  lines.push(div());
  lines.push(row("SPENT", val(`${spent} / ${CHARGEN_SKILL_POINTS}`)));
  lines.push(row("REMAINING", val(`${pool}`)));
  lines.push(div());
  u.send(lines.join("\r\n"));
}

export async function handleLifepathSet(u: IUrsamuSDK, _cpr: ICPRCharacter, arg: string): Promise<void> {
  const FIELD_MAP: Record<string, string> = {
    cultural_origin: "culturalOrigin", language: "language", personality: "personality",
    clothing_style: "clothingStyle", hairstyle: "hairstyle", affectation: "affectation",
    life_goal: "lifeGoal", most_valued_person: "mostValuablePerson",
    most_valued_thing: "mostValuableThing", feeling_about_people: "feelingAboutPeople",
    family_background: "familyBackground", childhood_environment: "childhoodEnvironment",
    family_crisis: "familyCrisis", friend_name: "friendName", friend_how: "friendHow",
    enemies: "enemies", life_events: "lifeEvents", role_events: "roleEvents",
  };
  const [fieldRaw, ...valueParts] = arg.split("=");
  const fieldKey = (fieldRaw ?? "").toLowerCase().trim().replace(/ /g, "_");
  const value    = valueParts.join("=").trim();
  const mapped   = FIELD_MAP[fieldKey];

  if (!mapped) {
    u.send([
      `${ERR}Unknown field: ${acc(fieldKey)}`,
      `  ${dim("Valid fields:")}`,
      ...grid(Object.keys(FIELD_MAP).map(acc), 3, "    "),
    ].join("\r\n"));
    return;
  }
  if (!value) {
    u.send(`${ERR}Provide a value: ${val(`+chargen/set ${fieldKey}=<value>`)}`);
    return;
  }
  await u.db.modify(u.me.id, "$set", { [`state.cpr.lifepath.${mapped}`]: value });
  u.send(`  ${OK}${lbl(fieldKey.replace(/_/g, " ").toUpperCase())}  ${dim("->")}  ${value}`);
}

export async function handleLifestyleSet(u: IUrsamuSDK, cpr: ICPRCharacter, arg: string): Promise<void> {
  if (cpr.chargenStage !== "lifestyle") {
    u.send(`${ERR}Not at the lifestyle stage. Type ${val("+chargen")} to check your stage.`);
    return;
  }
  const tierName = arg.toLowerCase().trim().replace(/ /g, "_");
  const ls = LIFESTYLES.find((l) => l.name === tierName);
  if (!ls) {
    u.send([
      `${ERR}Unknown tier. Valid tiers:`,
      ...grid(LIFESTYLES.map((l) => acc(l.name)), 3, "    "),
    ].join("\r\n"));
    return;
  }
  const res = applyLifestyle(cpr, tierName);
  if (!res.ok) {
    u.send(`${ERR}${res.error}`);
    return;
  }
  const d = res.draft;
  const nextDue = d.lifestyle?.nextDueDate ??
    (Date.now() + 30 * 24 * 60 * 60 * 1000);
  const pocket = d.eurodollars ?? 0;
  const method = (d.chargenMethod ?? "streetrat") as
    keyof typeof STARTING_EB;
  const bookStart = STARTING_EB[method] ?? pocket;
  await u.db.modify(u.me.id, "$set", {
    "state.cpr.lifestyle": d.lifestyle,
    "state.cpr.chargenStage": "cyberware",
    // Preserve pocket / shop budget — never replace with rent
    "state.cpr.eurodollars": pocket,
  });
  u.send([
    ...stageHeader(d),
    `  ${OK}Lifestyle set: ${val(ls.displayName)}`,
    row("MONTHLY COST", val(`${ls.monthlyCostEb.toLocaleString()} eb`)),
    row(
      "POCKET EB",
      `${val(pocket.toLocaleString())} ${dim(
        method === "complete"
          ? "eb  (shop budget remaining)"
          : "eb  (kit free + pocket)",
      )}`,
    ),
    row(
      "BOOK START",
      dim(`${bookStart.toLocaleString()} eb before gear spends`),
    ),
    row("DUE DATE", dim(new Date(nextDue).toLocaleDateString())),
    div(),
    `  ${ARR}First month is free. Next: ${val("+chargen/chrome list")}`,
    `  ${ARR}Or skip ahead:         ${val("+chargen/next")}`,
    bar(),
  ].join("\r\n"));
}

export async function handleNotes(
  u: IUrsamuSDK,
  cpr: ICPRCharacter,
  arg: string,
): Promise<void> {
  const { applyConceptNotes, CONCEPT_NOTES_MIN } = await import(
    "../engine/chargen-ops.ts"
  );
  if (!arg.trim()) {
    const cur = String(cpr.conceptNotes ?? "").trim();
    const n = cur.length;
    const body = cur
      ? wrap(cur, W - 2)
      : [`  ${dim("(empty — write who this edgerunner is)")}`];
    u.send([
      bar(),
      hdr("CONCEPT NOTES"),
      bar(),
      ...body,
      div(),
      row(
        "LENGTH",
        `${val(String(n))} / ${dim(String(CONCEPT_NOTES_MIN))} min`,
      ),
      `  ${ARR}${val("+chargen/notes <text>")}  set notes`,
      bar(),
    ].join("\r\n"));
    return;
  }
  const res = applyConceptNotes(cpr, arg);
  if (!res.ok) {
    u.send(`${ERR}${res.error}`);
    return;
  }
  await u.db.modify(u.me.id, "$set", { "state.cpr": res.draft });
  const n = String(res.draft.conceptNotes ?? "").length;
  u.send(
    `  ${OK}Concept notes saved (${val(String(n))} chars).` +
      (n < CONCEPT_NOTES_MIN
        ? `  ${dim(`Need ${CONCEPT_NOTES_MIN - n} more.`)}`
        : `  ${dim("Ready to +chargen/done.")}`),
  );
}

export async function handleDone(
  u: IUrsamuSDK,
  cpr: ICPRCharacter,
  arg = "",
): Promise<void> {
  if (cpr.chargenStatus === "pending") {
    u.send(
      `${ARR}Already pending staff review. Hang tight — ` +
        `or ask staff to ${val("+reject")} if you need edits.`,
    );
    return;
  }
  if (cpr.chargenComplete || cpr.chargenStatus === "approved") {
    u.send(
      `${ARR}Already approved. Type ${val("+sheet")}.`,
    );
    return;
  }
  if (cpr.chargenStage !== "review") {
    u.send(
      `${ERR}Complete all stages first. Type ${val("+chargen")} ` +
        `to see where you are.`,
    );
    return;
  }
  if (!cpr.role) {
    u.send(`${ERR}You must choose a role before submitting.`);
    return;
  }

  const { submitDraft, CONCEPT_NOTES_MIN } = await import(
    "../engine/chargen-ops.ts"
  );
  // Optional notes on the done line: +chargen/done My story...
  const res = submitDraft(cpr, arg.trim() ? arg : undefined);
  if (!res.ok) {
    u.send(`${ERR}${res.error}`);
    if (String(res.error).toLowerCase().includes("notes")) {
      u.send(
        `  ${ARR}${val("+chargen/notes <text>")}  ` +
          `(min ${CONCEPT_NOTES_MIN} chars) then ` +
          `${val("+chargen/done")}`,
      );
    }
    return;
  }

  await u.db.modify(u.me.id, "$set", { "state.cpr": res.draft });

  let jobNote = "";
  try {
    const { openCgenJob } = await import(
      "../src/chargen/cgen_job.ts"
    );
    const jobRes = await openCgenJob({
      actorId: u.me.id,
      actorName: u.me.name ?? "Unknown",
      cpr: res.draft,
    });
    if ("number" in jobRes) {
      jobNote = `  ${dim(`Staff CGEN #${jobRes.number} filed.`)}`;
    }
  } catch (e: unknown) {
    console.error("[cpr] CGEN job on done:", e);
  }

  const name = (u.util.displayName(u.me, u.me) as string)
    .toUpperCase();
  const roleDef = getRole(cpr.role);

  u.send([
    bar("="),
    hdr(`SUBMITTED :: ${name}`),
    bar("="),
    `  ${dim("Sheet filed for staff approval. Play unlocks after review.")}`,
    div(),
    row("ROLE", val(roleDef.displayName)),
    row("STATUS", `${ARR}PENDING`),
    ...(jobNote ? [jobNote] : []),
    div(),
    `  ${ARR}Staff: close the CGEN job or ` +
      `${val("+approve <name>")}`,
    `  ${ARR}Need changes? Ask staff to ` +
      `${val("+reject <name>")}`,
    bar("="),
  ].join("\r\n"));
}

// Role-to-weapon-skill map for gear suggestions
const ROLE_WEAPON_SKILLS: Record<Role, string[]> = {
  rockerboy: ["handgun", "melee_weapon"],
  solo:      ["handgun", "shoulder_arms", "melee_weapon"],
  netrunner: ["handgun"],
  medtech:   ["handgun"],
  tech:      ["handgun"],
  media:     ["handgun"],
  exec:      ["handgun", "melee_weapon"],
  lawman:    ["handgun", "shoulder_arms"],
  fixer:     ["handgun", "melee_weapon"],
  nomad:     ["handgun", "shoulder_arms"],
};

export async function handleChrome(u: IUrsamuSDK, cpr: ICPRCharacter, arg: string): Promise<void> {
  if (cpr.chargenStage !== "cyberware") {
    u.send(`${ERR}Not at the chrome stage. Type ${val("+chargen")} to check your stage.`);
    return;
  }

  const sub = arg.trim().toLowerCase();

  if (!sub || sub === "list" || sub.startsWith("list ")) {
    const filterCat = sub.startsWith("list ")
      ? sub.slice(5).trim().replace(/ /g, "")
      : "";
    const catalog = CYBERWARE_CATALOG.filter((c) =>
      !filterCat || c.category.replace(/_/g, "") === filterCat ||
      c.category === filterCat
    );
    const byCategory: Record<string, typeof catalog> = {};
    for (const c of catalog) {
      (byCategory[c.category] ??= []).push(c);
    }
    const installed = (cpr.cyberware ?? []).map((c) => c.name);
    const totalHL   = (cpr.humanityLoss ?? 0);
    const CHROME_COLS = [
      { label: "NAME",     width: 24 },
      { label: "HL",       width: 4  },
      { label: "SLOTS",    width: 5  },
      { label: "REQUIRES", width: 16 },
    ];
    const lines: string[] = [
      bar(),
      hdr("CYBERWARE CATALOG"),
      bar(),
      row("INSTALLED", `${val(installed.length)} ${dim("piece(s)")}`),
      row("HUMANITY",  `${val(totalHL)} ${dim("HL")}  ${val(60 - totalHL)} ${dim("left")}`),
      row("TIP", dim("+chargen/chrome list <category>  ·  foundations first")),
    ];
    for (const [cat, items] of Object.entries(byCategory)) {
      lines.push(div());
      lines.push(`  ${lbl(cat.toUpperCase())}  ${dim(`(${items.length})`)}`);
      lines.push("");
      const catRows = items.map((item) => {
        const tick = installed.includes(item.name) ? `%cg[+]%cn` : `%cw[ ]%cn`;
        const name = `${tick} ${val(displayCyberName(item.name))}`;
        const hl = String(effectiveHL(item));
        const slots = item.optionSlots != null
          ? String(item.optionSlots)
          : item.slotCost != null
          ? dim(`-${item.slotCost}`)
          : dim("--");
        const req = item.requiresFoundation
          ? dim(displayCyberName(item.requiresFoundation) +
            (item.paired ? " x2" : ""))
          : dim("--");
        return [name, hl, slots, req];
      });
      lines.push(...tbl(CHROME_COLS, catRows));
      lines.push("");
    }
    lines.push(div());
    lines.push(
      `  ${ARR}${val("+chargen/chrome neural link")}  install  |  ` +
        `${val("+chargen/chrome remove subdermal armor")}`,
    );
    lines.push(bar());
    u.send(lines.join("\r\n"));
    return;
  }

  if (sub.startsWith("remove ")) {
    // Keep spaces — removeChrome normalizes internally
    const itemName = sub.slice(7).trim();
    const res = removeChrome(cpr, itemName);
    if (!res.ok) {
      u.send(`${ERR}${res.error}`);
      return;
    }
    await u.db.modify(u.me.id, "$set", { "state.cpr": res.draft });
    const shown = displayCyberName(
      String(res.meta?.removed ?? itemName),
    );
    u.send(
      `  ${OK}Removed ${val(shown)}.` +
        `  ${dim(`HL recovered: ${res.meta?.refundHL ?? 0}`)}`,
    );
    return;
  }

  // install via shared foundation/slot rules (spaces OK)
  const itemName = sub.trim();
  const res = installChrome(cpr, itemName);
  if (!res.ok) {
    u.send(`${ERR}${res.error}`);
    return;
  }
  await u.db.modify(u.me.id, "$set", { "state.cpr": res.draft });
  const defName = displayCyberName(
    String(res.meta?.installed ?? itemName),
  );
  u.send([
    div(),
    `  ${OK}Chrome installed: ${val(defName)}`,
    row(
      "HL",
      `${val(String(res.meta?.hl ?? "?"))}  ` +
        `${dim(`total ${(res.draft.humanityLoss ?? 0)} / 60`)}`,
    ),
    res.meta?.needs
      ? row(
        "MOUNTED ON",
        acc(displayCyberName(String(res.meta.needs))),
      )
      : "",
    div(),
  ].filter(Boolean).join("\r\n"));
  return;
}

export async function handleGear(u: IUrsamuSDK, cpr: ICPRCharacter, arg: string): Promise<void> {
  if (cpr.chargenStage !== "equipment") {
    u.send(`${ERR}Not at the gear stage. Type ${val("+chargen")} to check your stage.`);
    return;
  }

  const sub = arg.trim().toLowerCase();
  const roleSkills = ROLE_WEAPON_SKILLS[cpr.role as Role] ?? ["handgun"];
  const budget     = cpr.eurodollars ?? 0;

  if (!sub || sub === "list") {
    const suggested = WEAPONS.filter((w) => roleSkills.includes(w.skill) && w.costEb <= budget);
    const other     = WEAPONS.filter((w) => !roleSkills.includes(w.skill) && w.costEb <= Math.min(budget, 500));
    const loadout   = ((cpr.roleData as Record<string, unknown>).startingGear ?? []) as string[];
    const spent     = loadout.reduce((sum, n) => {
      const w = WEAPONS.find((x) => x.name === n);
      return sum + (w?.costEb ?? 0);
    }, 0);

    const WEAPON_COLS = [
      { label: "NAME",   width: 22 },
      { label: "DMG",    width: 5  },
      { label: "ROF",    width: 3  },
      { label: "HANDS",  width: 5  },
      { label: "COST",   width: 7  },
      { label: "SKILL",  width: 16 },
    ];
    const weaponRow = (w: typeof WEAPONS[0]) => {
      const tick = loadout.includes(w.name) ? `%cg[+]%cn` : `%cw[ ]%cn`;
      return [
        `${tick} ${val(w.name.replace(/_/g, " "))}`,
        dim(w.damage),
        dim(String(w.rof)),
        dim(String(w.hands)),
        dim(`${w.costEb}eb`),
        dim(w.skill.replace(/_/g, " ")),
      ];
    };

    const lines: string[] = [
      bar(),
      hdr("STARTING GEAR"),
      bar(),
      row("EDDIES",   `${val(budget.toLocaleString())} ${dim("total")}`),
      row("SPENT",    `${val(spent.toLocaleString())} ${dim("eb")}`),
      row("LOADOUT",  loadout.length ? loadout.map((n) => acc(n.replace(/_/g, " "))).join("  ") : dim("empty")),
    ];

    if (suggested.length) {
      lines.push(div());
      lines.push(`  ${lbl("SUGGESTED FOR " + (cpr.role ?? "YOUR ROLE").toUpperCase())}`);
      lines.push("");
      lines.push(...tbl(WEAPON_COLS, suggested.map(weaponRow)));
      lines.push("");
    }

    if (other.length) {
      lines.push(div());
      lines.push(`  ${lbl("OTHER AFFORDABLE WEAPONS")}`);
      lines.push("");
      lines.push(...tbl(WEAPON_COLS, other.slice(0, 10).map(weaponRow)));
      lines.push("");
    }

    const affordableArmor = ARMOR_CATALOG.filter((a) => a.costEb <= budget);
    if (affordableArmor.length) {
      const ARMOR_COLS = [
        { label: "NAME",       width: 22 },
        { label: "SP",         width: 4  },
        { label: "PEN",        width: 4  },
        { label: "LOC",        width: 8  },
        { label: "COST",       width: 7  },
        { label: "CONCEAL",    width: 8  },
      ];
      const armorRow = (a: typeof ARMOR_CATALOG[0]) => {
        const tick = loadout.includes(a.name) ? `%cg[+]%cn` : `%cw[ ]%cn`;
        const pen  = a.penalty < 0 ? dim(String(a.penalty)) : dim("--");
        const loc  = dim(a.locations.join("/"));
        return [
          `${tick} ${val(a.name.replace(/_/g, " "))}`,
          dim(String(a.sp)),
          pen,
          loc,
          dim(`${a.costEb}eb`),
          dim(a.concealable ? "yes" : "no"),
        ];
      };
      lines.push(div());
      lines.push(`  ${lbl("ARMOR")}`);
      lines.push("");
      lines.push(...tbl(ARMOR_COLS, affordableArmor.map(armorRow)));
      lines.push("");
    }

    lines.push(div());
    lines.push(`  ${ARR}${val("+chargen/gear <name>")}  to add  |  ${val("+chargen/next")}  to skip`);
    lines.push(bar());
    u.send(lines.join("\r\n"));
    return;
  }

  // remove sub-command
  if (sub.startsWith("remove ")) {
    const itemName = sub.slice(7).replace(/ /g, "_");
    const roleData = (cpr.roleData ?? {}) as Record<string, unknown>;
    const loadout  = (roleData.startingGear ?? []) as string[];
    if (!loadout.includes(itemName)) { u.send(`${ERR}${val(itemName.replace(/_/g, " "))} not in loadout.`); return; }
    const wDef   = WEAPONS.find((w) => w.name === itemName);
    const aDef   = ARMOR_CATALOG.find((a) => a.name === itemName);
    const refund = wDef?.costEb ?? aDef?.costEb ?? 0;
    await u.db.modify(u.me.id, "$set", {
      "state.cpr.roleData.startingGear": loadout.filter((n) => n !== itemName),
      "state.cpr.eurodollars":           budget + refund,
    });
    u.send(`  ${OK}Removed ${val(itemName.replace(/_/g, " "))}.  ${dim(`${refund}eb refunded.`)}`);
    return;
  }

  // add item — check weapons first, then armor
  const itemName = sub.replace(/ /g, "_");
  const wDef = WEAPONS.find((w) => w.name === itemName);
  const aDef = ARMOR_CATALOG.find((a) => a.name === itemName);
  if (!wDef && !aDef) {
    u.send(`${ERR}Unknown item: ${val(itemName.replace(/_/g, " "))}. Use ${val("+chargen/gear list")} to browse.`);
    return;
  }
  const itemCost = wDef?.costEb ?? aDef!.costEb;
  const itemDisplayName = (wDef?.name ?? aDef!.name).replace(/_/g, " ");
  if (itemCost > budget) {
    u.send(`${ERR}Not enough eddies. ${dim(`${itemDisplayName} costs ${itemCost}eb, you have ${budget}eb.`)}`);
    return;
  }
  const roleData = (cpr.roleData ?? {}) as Record<string, unknown>;
  const loadout  = (roleData.startingGear ?? []) as string[];
  if (loadout.includes(itemName)) { u.send(`${ERR}Already in loadout.`); return; }

  await u.db.modify(u.me.id, "$set", {
    "state.cpr.roleData.startingGear": [...loadout, itemName],
    "state.cpr.eurodollars":           budget - itemCost,
  });
  const detailLines = wDef
    ? [row("DAMAGE", val(wDef.damage)), row("SKILL", acc(wDef.skill.replace(/_/g, " ")))]
    : [row("SP", val(String(aDef!.sp))), row("LOCATION", acc(aDef!.locations.join("/")))];
  u.send([
    div(),
    `  ${OK}Added to loadout: ${val(itemDisplayName)}`,
    ...detailLines,
    row("COST",   dim(`${itemCost}eb`)),
    row("EDDIES", `${val((budget - itemCost).toLocaleString())} ${dim("remaining")}`),
    div(),
  ].join("\r\n"));
}

const LIFEPATH_STAGES = new Set([
  "lifepath_cultural", "lifepath_personality", "lifepath_motivations",
  "lifepath_family", "lifepath_friends", "lifepath_enemies",
  "lifepath_events", "lifepath_role",
]);

/** Friendly aliases → canonical ChargenStage key */
const STAGE_ALIAS: Record<string, string> = {
  cultural: "lifepath_cultural",   origin: "lifepath_cultural",
  personality: "lifepath_personality", appearance: "lifepath_personality", look: "lifepath_personality",
  motivations: "lifepath_motivations", goals: "lifepath_motivations", values: "lifepath_motivations",
  family: "lifepath_family",       background: "lifepath_family",
  friends: "lifepath_friends",     allies: "lifepath_friends",
  enemies: "lifepath_enemies",     foes: "lifepath_enemies",
  events: "lifepath_events",       history: "lifepath_events",
  role: "lifepath_role",           defining: "lifepath_role",
};

/**
 * Parse a roll/detail arg that may start with an optional stage alias.
 * Returns the resolved stage and numeric roll (0 = not specified).
 */
function parseLifepathArg(
  raw: string,
  currentStage: string,
): { stage: string; n: number; error?: string } {
  const parts = raw.trim().split(/\s+/);
  const first = (parts[0] ?? "").toLowerCase();
  const resolved = STAGE_ALIAS[first];

  if (resolved) {
    const n = parts[1] ? parseInt(parts[1], 10) : 0;
    if (parts[1] && isNaN(n)) return { stage: resolved, n: 0, error: `Invalid roll number: ${parts[1]}` };
    return { stage: resolved, n };
  }

  // No alias — first token is a number (or empty), use current stage
  const n = first ? parseInt(first, 10) : 0;
  if (first && isNaN(n)) return { stage: currentStage, n: 0, error: `Unknown stage: ${first}` };
  return { stage: currentStage, n };
}

function inChargen(cpr: ICPRCharacter): boolean {
  return !!cpr.chargenStage && cpr.chargenStage !== "complete";
}

export async function handleRoll(u: IUrsamuSDK, cpr: ICPRCharacter, arg: string): Promise<void> {
  if (!inChargen(cpr)) {
    u.send(`${ERR}${val("/roll")} is only available during character generation.`);
    return;
  }

  const clean = u.util.stripSubs(arg);
  const { stage, n: designated, error } = parseLifepathArg(clean, cpr.chargenStage ?? "");

  if (error) { u.send(`${ERR}${error}`); return; }

  if (!LIFEPATH_STAGES.has(stage)) {
    const aliases = Object.keys(STAGE_ALIAS).filter((k) => k.length <= 10).join(", ");
    u.send([
      `${ERR}Not a lifepath stage. Valid names:`,
      `  ${dim(aliases)}`,
    ].join("\r\n"));
    return;
  }

  const maxRoll = stage === "lifepath_role" ? 6 : 10;
  if (designated && (designated < 1 || designated > maxRoll)) {
    u.send(`${ERR}Roll must be 1–${maxRoll}.`);
    return;
  }

  // Friends + Enemies: always roll the entire bundle at once (no cherry-picking)
  if (stage === "lifepath_friends") { await handleFriendBundleRoll(u, cpr); return; }
  if (stage === "lifepath_enemies") { await handleEnemyBundleRoll(u, cpr); return; }

  // Family: second roll is the crisis table if origin already set
  const rollCrisis = stage === "lifepath_family" && !!cpr.lifepath?.familyBackground;
  const n = designated || Math.ceil(Math.random() * maxRoll);
  const { lines, patch } = stageRollResult(stage as Parameters<typeof stageRollResult>[0], n, cpr.role, rollCrisis);

  // Merge array fields (lifeEvents, roleEvents, enemies) rather than overwrite
  const dbPatch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (Array.isArray(v)) {
      const existing = (cpr.lifepath as Record<string, unknown>)[k];
      dbPatch[`state.cpr.lifepath.${k}`] = Array.isArray(existing) ? [...existing, ...v] : v;
    } else {
      dbPatch[`state.cpr.lifepath.${k}`] = v;
    }
  }
  await u.db.modify(u.me.id, "$set", dbPatch);

  const stageLabel = stage.replace("lifepath_", "").toUpperCase();
  u.send([
    div(),
    `  ${OK}${lbl(stageLabel)}  ${dim("roll:")}  ${val(String(n))}`,
    div(),
    ...lines,
    div(),
    `  ${dim("+chargen/roll [<stage>] [<n>]  ·  +chargen/next to continue")}`,
  ].join("\r\n"));
}

function d10(): number { return Math.ceil(Math.random() * 10); }

async function handleFriendBundleRoll(u: IUrsamuSDK, cpr: ICPRCharacter): Promise<void> {
  const count = Math.max(0, d10() - 7);
  const friends: string[] = [];

  for (let i = 0; i < count; i++) {
    const { patch } = stageRollResult("lifepath_friends", d10(), cpr.role);
    friends.push(patch.friendHow ?? "");
  }

  await u.db.modify(u.me.id, "$set", {
    "state.cpr.lifepath.friends":       friends,
    "state.cpr.lifepath._friendCount":  count,
  });

  const footer = `  ${dim("+chargen/reroll friends")}  ${dim("·")}  ${val("+chargen/next")} ${dim("to accept")}`;
  if (count === 0) {
    u.send([div(), `  ${OK}${lbl("FRIENDS")}  ${val("0")}  ${dim("-- no friends in this life.")}`, div(), footer].join("\r\n"));
    return;
  }
  u.send([
    div(),
    `  ${OK}${lbl("FRIENDS")}  ${val(String(count))} ${dim("total")}`,
    div(),
    ...friends.map((f, i) => row(`FRIEND ${i + 1}`, val(f))),
    div(),
    footer,
  ].join("\r\n"));
}

async function handleEnemyBundleRoll(u: IUrsamuSDK, cpr: ICPRCharacter): Promise<void> {
  const count = Math.max(0, d10() - 7);
  const enemies: { description: string; causeOfEnmity: string; whatTheyHave: string; numPeople: number }[] = [];

  for (let i = 0; i < count; i++) {
    const { patch } = stageRollResult("lifepath_enemies", d10(), cpr.role);
    const entry = (patch.enemies ?? [])[0];
    if (entry) enemies.push(entry);
  }

  await u.db.modify(u.me.id, "$set", {
    "state.cpr.lifepath.enemies":      enemies,
    "state.cpr.lifepath._enemyCount":  count,
  });

  const footer = `  ${dim("+chargen/reroll enemies")}  ${dim("·")}  ${val("+chargen/next")} ${dim("to accept")}`;
  if (count === 0) {
    u.send([div(), `  ${OK}${lbl("ENEMIES")}  ${val("0")}  ${dim("-- no enemies. Yet.")}`, div(), footer].join("\r\n"));
    return;
  }
  u.send([
    div(),
    `  ${OK}${lbl("ENEMIES")}  ${val(String(count))} ${dim("total")}`,
    div(),
    ...enemies.map((e, i) => row(`ENEMY ${i + 1}`, `${val(e.description)}  ${dim("|")}  ${dim(e.causeOfEnmity.slice(0, 26))}`)),
    div(),
    footer,
  ].join("\r\n"));
}

export async function handleReroll(u: IUrsamuSDK, cpr: ICPRCharacter, arg: string): Promise<void> {
  if (!inChargen(cpr)) {
    u.send(`${ERR}${val("/reroll")} is only available during character generation.`);
    return;
  }
  const clean = u.util.stripSubs(arg);
  const { stage, error } = parseLifepathArg(clean, cpr.chargenStage ?? "");
  if (error) { u.send(`${ERR}${error}`); return; }
  if (stage !== "lifepath_friends" && stage !== "lifepath_enemies") {
    u.send(`${ERR}${val("/reroll")} only works for ${val("friends")} and ${val("enemies")} stages.`);
    return;
  }
  if (stage === "lifepath_friends") { await handleFriendBundleRoll(u, cpr); return; }
  await handleEnemyBundleRoll(u, cpr);
}

export function handleDetail(u: IUrsamuSDK, cpr: ICPRCharacter, arg: string): void {
  if (!inChargen(cpr)) {
    u.send(`${ERR}${val("/detail")} is only available during character generation.`);
    return;
  }

  const clean = u.util.stripSubs(arg);
  const { stage, n, error } = parseLifepathArg(clean, cpr.chargenStage ?? "");

  if (error) { u.send(`${ERR}${error}`); return; }

  if (!LIFEPATH_STAGES.has(stage)) {
    u.send(`${ERR}Provide a lifepath stage name and roll. Example: ${val("+chargen/detail enemies 7")}`);
    return;
  }

  const maxRoll = stage === "lifepath_role" ? 6 : 10;
  if (!n || n < 1 || n > maxRoll) {
    u.send(`${ERR}Provide a roll number 1–${maxRoll}. Example: ${val(`+chargen/detail ${stage.replace("lifepath_", "")} 7`)}`);
    return;
  }

  const lines = stageDetailLines(stage as Parameters<typeof stageDetailLines>[0], n, cpr.role);
  u.send(lines.join("\r\n"));
}

export async function handleReset(u: IUrsamuSDK, arg: string): Promise<void> {
  const isStaff =
    u.me.flags.has("wizard") ||
    u.me.flags.has("superuser") ||
    u.me.flags.has("admin");
  if (!isStaff) {
    u.send(`${ERR}Wizard+ only — wipe an approved or draft sheet.`);
    return;
  }
  const raw = u.util.stripSubs(arg || "").trim();
  if (!raw) {
    u.send(
      `${ERR}Usage: ${val("+chargen/reset <name>")} ` +
        `or ${val("+cprreset <name>")}`,
    );
    return;
  }
  const target = await u.util.target(u.me, raw, true);
  if (!target) {
    u.send(`${ERR}Target not found.`);
    return;
  }

  const { wipeCharacter } = await import(
    "../src/chargen/wipe_core.ts"
  );
  const staffName = String(
    u.util.displayName(u.me, u.me) || u.me.name || "Staff",
  );
  const res = await wipeCharacter({
    playerId: String(target.id),
    staffName,
    notify: (pid, msg) => {
      u.send(msg, pid);
    },
  });
  if (!res.ok) {
    u.send(`${ERR}${res.error}`);
    return;
  }

  const displayName = u.util.displayName(target, u.me) as string;
  const status = !res.hadSheet
    ? "no sheet on file"
    : res.wasApproved
    ? "approved sheet wiped"
    : "draft wiped";
  u.send([
    div(),
    `  ${OK}Character wiped.`,
    row("TARGET", val(displayName)),
    row("WAS", val(status)),
    ...wrap(
      "They can run +chargen again to start over.",
      W - 2,
    ),
    div(),
  ].join("\r\n"));
}

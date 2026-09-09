// core/renderer.ts -- MUSH-formatted output for sheets, budgets, and dashboards.
// Latin-1 safe: no Unicode beyond 0xFF. Numbers instead of dot graphics.
import type { IWoDChar, IStepBudget, IWtaSplatExt, IVtmSplatExt, DamageMark } from "./types.ts";
import type { IDiceRoll } from "./dice.ts";
import { SplatRegistry } from "./registry.ts";
import {
  header,
  divider,
  footer,
  frame,
  WIDTH as W,
  vlen,
  clipVis,
  padVis,
} from "./format.ts";
import {
  ATTR_BASE,
  ATTRIBUTE_GROUPS,
  ABILITY_GROUPS,
} from "./attributes.ts";
import { validateStep } from "./validator.ts";
import { HEALTH_LEVELS, HEALTH_TRACK_SIZE, markChar } from "./health.ts";
import { FORM_MODIFIERS, FORM_ATTRS, defaultFormForBreed, type Form } from "./forms.ts";
import { frenzyRemaining, isFrenzied } from "./frenzy.ts";
import { nextRankRequirement, RANK_NAMES } from "./renown.ts";
import { normaliseAuspice } from "./renownThresholds.ts";
import { woundPenalty } from "./wounds.ts";

const COL = Math.floor(W / 3); // 26

// Three-column layout: [contentWidth, trailingSpaces]
// Totals: 26 + 26 + 26 = 78 chars -- 2-space gap between each col, no trailing on last.
const COL_LAYOUT = [[24, 2], [24, 2], [26, 0]] as const;

// Two-column layout for Backgrounds/Gifts: 39 + 39 = 78 chars.
const COL2_LAYOUT = [[37, 2], [39, 0]] as const;

// -- Public API -------------------------------------------------------------

/** Full character sheet. */
export async function formatSheet(char: IWoDChar, isStaff: boolean, playerName?: string): Promise<string> {
  const lines: string[] = [];

  const displayName = char.moniker || char.fullName || playerName || char.playerId;
  lines.push(header(`Character Sheet for: ${displayName}`));

  // Identity -- flow only set fields, two per row.
  // Value clipped so cols2 never exceeds 78.
  const half = Math.floor(W / 2);
  const lbl = (key: string, val: string, kw: number) => {
    const prefix = `%ch${key}%cn` +
      " ".repeat(Math.max(0, kw - key.length)) + " ";
    const room = half - vlen(prefix);
    return prefix + clipVis(String(val ?? ""), Math.max(0, room));
  };

  const { breed: breedName, auspice: auspiceName, tribe: tribeName } = identityNames(char);

  // Always show all fields applicable to this template; value is blank until set.
  const idFields: string[] = [];
  idFields.push(lbl("Full Name:", char.fullName                            ?? "", 10));
  idFields.push(lbl("Concept:",   char.concept                             || "", 10));
  idFields.push(lbl("Age:",       char.age                                 ?? "", 10));
  idFields.push(lbl("Nature:",    char.nature                              ?? "", 10));
  idFields.push(lbl("Demeanor:",  char.demeanor                            ?? "", 10));
  if (char.splat === "wta" || char.splat === "kinfolk") {
    idFields.push(lbl("Breed:",   breedName, 10));
  }
  if (char.splat === "wta") {
    idFields.push(lbl("Auspice:", auspiceName, 10));
    idFields.push(lbl("Tribe:",   tribeName,   10));
    const curForm = (char.currentForm ?? defaultFormForBreed(char.breed)) as Form;
    const formName = curForm.charAt(0).toUpperCase() + curForm.slice(1);
    idFields.push(lbl("Form:",    formName, 10));
    if (char.deedName?.trim()) idFields.push(lbl("Deed:", char.deedName, 10));
  }
  if (char.splat === "kinfolk") {
    idFields.push(lbl("Tribe:",   tribeName,   10));
  }
  if (char.splat === "vtm") {
    const clanName = clanDisplay(char);
    idFields.push(lbl("Clan:",    clanName, 10));
    idFields.push(lbl("Path:",    char.path ?? "Humanity", 10));
    idFields.push(lbl("Gen:",     String(char.generation ?? 13), 10));
    idFields.push(lbl("Sire:",    char.sire ?? "", 10));
  }
  if (char.breed === "metis") {
    idFields.push(lbl("Deformity:", char.deformity                         ?? "", 10));
  }

  for (let i = 0; i < idFields.length; i += 2) {
    lines.push(cols2(idFields[i], idFields[i + 1] ?? ""));
  }

  // Attributes -- three columns: Physical | Social | Mental
  lines.push(divider("Attributes"));
  lines.push(traitTable(
    ["Physical", "Social", "Mental"],
    [
      ATTRIBUTE_GROUPS.physical as unknown as string[],
      ATTRIBUTE_GROUPS.social   as unknown as string[],
      ATTRIBUTE_GROUPS.mental   as unknown as string[],
    ],
    char.attributes, char.attributesTemp, char.attributeSpecialties,
    ATTR_BASE,
  ));

  // Form status line -- WtA only, only when in a non-homid form.
  if (char.splat === "wta") {
    const curForm = (char.currentForm ?? defaultFormForBreed(char.breed)) as Form;
    if (curForm !== "homid") {
      const mods = FORM_MODIFIERS[curForm];
      const cell = (a: string) => {
        const n = mods[a] ?? 0;
        const short = a.slice(0, 3);
        return `${short} ${n >= 0 ? "+" : ""}${n}`;
      };
      const formName = curForm.charAt(0).toUpperCase() + curForm.slice(1);
      lines.push(`%chForm:%cn ${formName}  (${FORM_ATTRS.map(cell).join(", ")})`);
    }
  }

  // Abilities -- three columns: Talents | Skills | Knowledges
  lines.push(divider("Abilities"));
  lines.push(traitTable(
    ["Talents", "Skills", "Knowledges"],
    [
      ABILITY_GROUPS.talents    as unknown as string[],
      ABILITY_GROUPS.skills     as unknown as string[],
      ABILITY_GROUPS.knowledges as unknown as string[],
    ],
    char.abilities, char.abilitiesTemp, char.abilitySpecialties, 0,
  ));

  // Specialties -- optional 2-col section
  const allSpecialties: [string, string][] = [
    ...Object.entries(char.attributeSpecialties),
    ...Object.entries(char.abilitySpecialties),
  ];
  if (allSpecialties.length > 0) {
    lines.push(divider("Specialties"));
    lines.push(...specialtiesTable(allSpecialties));
  }

  // Backgrounds -- 2-col dot-fill (hidden when empty)
  const bgEntries = Object.entries(char.backgrounds).filter(([, v]) => v > 0);
  if (bgEntries.length > 0) {
    lines.push(divider("Backgrounds"));
    lines.push(bgTable(char.backgrounds, char.backgroundDetails));
  }

  // Merits & Flaws -- left col merits, right col flaws
  if (Object.keys(char.merits ?? {}).length > 0 || Object.keys(char.flaws ?? {}).length > 0) {
    lines.push(divider("Merits & Flaws"));
    lines.push(...meritsFlawsTable(char.merits ?? {}, char.flaws ?? {}));
  }

  // Gifts (WtA) -- 2-col list (hidden when empty)
  if (char.splat === "wta") {
    const giftItems = (char.gifts ?? []).filter(Boolean);
    if (giftItems.length > 0) {
      lines.push(divider("Gifts"));
      for (let gi = 0; gi < giftItems.length; gi += 2) {
        const left  = giftItems[gi];
        const right = giftItems[gi + 1];
        lines.push(twoColCell(left, right));
      }
    }
  }

  // Disciplines & Virtues (VtM) -- 2-col dot-fill (hidden when empty)
  if (char.splat === "vtm") {
    const discEntries = Object.entries(char.disciplines ?? {})
      .filter(([, v]) => v > 0);
    if (discEntries.length > 0) {
      lines.push(divider("Disciplines"));
      lines.push(bgTable(char.disciplines ?? {}));
    }
    const virtEntries = Object.entries(char.virtues ?? {})
      .filter(([, v]) => v > 0);
    if (virtEntries.length > 0) {
      lines.push(divider("Virtues"));
      lines.push(bgTable(char.virtues ?? {}));
    }
    const ritualItems = (char.rituals ?? []).filter(Boolean);
    if (ritualItems.length > 0) {
      lines.push(divider("Rituals"));
      for (let ri = 0; ri < ritualItems.length; ri += 2) {
        const left  = ritualItems[ri];
        const right = ritualItems[ri + 1];
        lines.push(twoColCell(left, right));
      }
    }
  }

  // Rites (WtA) -- 2-col list of rite display names (hidden when empty)
  if (char.splat === "wta") {
    const riteSlugs = (char.rites ?? []).filter(Boolean);
    if (riteSlugs.length > 0) {
      const splatDef = SplatRegistry.get("wta");
      const wtaExt = splatDef?.ext as IWtaSplatExt | undefined;
      const rites = wtaExt?.rites;
      const riteItems = riteSlugs.map(
        (s) => rites?.[s.toLowerCase()]?.name ?? s,
      );
      lines.push(divider("Rites"));
      for (let ri = 0; ri < riteItems.length; ri += 2) {
        lines.push(twoColCell(riteItems[ri], riteItems[ri + 1]));
      }
    }
  }

  // Pools -- three columns: Pools | Renown/Template | Health
  lines.push(divider("Pools"));
  lines.push(...poolsSection(char));

  lines.push(footer());

  // Staff section
  if (isStaff) {
    const statusWord = char.status === "approved"   ? "%cgApproved%cn"
      : char.status === "submitted" ? "%cySubmitted - Pending Review%cn"
      : char.status === "denied"    ? "%crDenied%cn"
      : "%cyDraft%cn";
    lines.push(divider("%crStaff Section%cn"));

    lines.push(clipVis(`%chStatus:%cn ${statusWord}`, W));
    if (char.staffNotes) {
      lines.push(clipVis(`%chNotes:%cn  ${char.staffNotes}`, W));
    }
    if (char.approvedBy) {
      lines.push(clipVis(`%chApproved:%cn ${char.approvedBy}`, W));
    }
    if (char.deniedReason) {
      lines.push(clipVis(`%chDenied:%cn  ${char.deniedReason}`, W));
    }

    // Stat log -- 2 entries per row
    if (char.statLog.length > 0) {
      lines.push(divider("Stat Log"));
      const entries = char.statLog.slice(-10).map((e) =>
        `%ch${e.trait}%cn: ${JSON.stringify(e.old)}->` +
          `${JSON.stringify(e.new)} (${e.staffId})`
      );
      for (let i = 0; i < entries.length; i += 2) {
        lines.push(twoColCell(entries[i], entries[i + 1]));
      }
    }

    lines.push(footer());
  }

  return lines.join("%r");
}

/** Step budget display -- appended to every +chargen/set response. */
export async function formatBudget(budget: IStepBudget): Promise<string> {
  const statusColor = budget.complete ? "%cg" : "%cy";
  const statusLabel = budget.complete
    ? `${statusColor}COMPLETE%cn`
    : `${statusColor}IN PROGRESS%cn`;

  const lines: string[] = [
    divider(`Step ${budget.step}`),
    `Status: ${statusLabel}`,
  ];

  if (Object.keys(budget.remaining).length > 0) {
    const parts = Object.entries(budget.remaining).map(([k, v]) => {
      const label = k
        .replace(/Dots$/, "")
        .replace(/Needed$/, "")
        .replace(/([a-z])([A-Z])/g, "$1 $2")
        .replace(/^./, (c) => c.toUpperCase());
      return v >= 0
        ? `${label}: %cy${v}%cn remaining`
        : `${label}: %cr${-v}%cn over`;
    });
    // Pack "a | b | c" into ≤78-col lines (step 4/5 can have 6 buckets).
    for (const ln of packSep(parts, "  |  ", W)) {
      lines.push(ln);
    }
  }

  if (budget.issues.length > 0) {
    const MAX = W - 4; // "  ! " prefix = 4 visual chars
    lines.push(divider("Errors"));
    budget.issues.forEach((issue) => {
      const msg = clipVis(issue, MAX);
      lines.push(`  %ch%cr!%cn %cr${msg}%cn`);
    });
  }

  return lines.join("%r");
}

/**
 * Resolve identity field display values (breed/auspice/tribe) using the splat
 * registry where available. Returns "-" fallback when a field is unset.
 */
function identityNames(char: IWoDChar): { breed: string; auspice: string; tribe: string } {
  const splat = SplatRegistry.get(char.splat);
  const ext   = splat?.ext as IWtaSplatExt | undefined;
  const breedDef   = ext?.breeds?.find((b) => b.id === char.breed);
  const auspiceDef = ext?.auspices?.find((a) => a.id === char.auspice);
  const tribeDef   = ext?.tribes?.find((t) => t.id === char.tribe);
  return {
    breed:   breedDef?.name        ?? char.breed   ?? "-",
    auspice: auspiceDef?.name      ?? char.auspice ?? "-",
    tribe:   tribeDef?.displayName ?? char.tribe   ?? "-",
  };
}

/** VtM: display name for the character's clan. */
function clanDisplay(char: IWoDChar): string {
  if (!char.clan) return "-";
  const ext = SplatRegistry.get("vtm")?.ext as IVtmSplatExt | undefined;
  const def = ext?.clans?.find(
    (c) => c.id === char.clan || c.name.toLowerCase() === char.clan?.toLowerCase(),
  );
  return def?.displayName ?? char.clan;
}

/**
 * Splat-aware dashboard header row -- returns three pre-labelled cells suitable
 * for cols3(). Dispatch off char.splat keeps this future-proof: add a case per
 * new splat rather than expanding a hardcoded "Breed/Auspice/Tribe" row.
 */
function dashboardHeaderCells(char: IWoDChar): [string, string, string] {
  const { breed, auspice, tribe } = identityNames(char);
  const concept  = char.concept  || "-";
  const nature   = char.nature   || "-";
  const demeanor = char.demeanor || "-";

  switch (char.splat) {
    case "wta":
      return [
        `Breed:   ${breed}`,
        `Auspice: ${auspice}`,
        `Tribe:   ${tribe}`,
      ];
    case "kinfolk":
      return [
        `Concept: ${concept}`,
        `Tribe:   ${tribe}`,
        `Nature:  ${nature}`,
      ];
    case "mortal":
    default:
      return [
        `Concept:  ${concept}`,
        `Nature:   ${nature}`,
        `Demeanor: ${demeanor}`,
      ];
  }
}

/**
 * Full progress dashboard (+chargen with no switch).
 * Matches ursamu-wod20th-plugin layout; every line hard-capped at 78.
 *
 *   ===================== CHARGEN - Werewolf: the Apocalypse =====================
 *   Breed:   Homid            Auspice: Theurge          Tribe:   Wendigo
 *   ==============================================================================
 *     [~] Step 1 - Sub-template      +chargen/set tribe=<tribe>
 *     [X] Step 2 - Concept           Complete
 *     [ ] Step 3 - Attributes        (locked)
 *   ...
 */
export async function formatDashboard(char: IWoDChar): Promise<string> {
  const splat = SplatRegistry.get(char.splat);
  const [c1, c2, c3] = dashboardHeaderCells(char);

  const lines: string[] = [
    header(`CHARGEN - ${splat?.name ?? char.splat}`),
    cols3(c1, c2, c3),
    footer(),
  ];

  const steps = [
    { n: 1, label: "Sub-template" },
    { n: 2, label: "Concept" },
    { n: 3, label: "Attributes" },
    { n: 4, label: "Abilities" },
    { n: 5, label: "Advantages" },
    { n: 6, label: "Freebies" },
  ] as const;

  // "  [~] " (6) + tag (26) + " " (1) + summary (45) = 78
  const TAG_W = 26;
  const SUMMARY_W = W - 6 - TAG_W - 1; // 45

  for (const { n, label } of steps) {
    const budget = validateStep(char, n);
    const locked = n > char.chargenStep + 1;
    const tag = padVis(`Step ${n} - ${label}`, TAG_W);

    if (locked) {
      lines.push(clipVis(
        `  %ch[ ]%cn ${tag} %cy(locked)%cn`,
        W,
      ));
    } else if (budget.complete) {
      const doneNote = stepDoneNote(char, n);
      lines.push(clipVis(
        `  %ch%cg[X]%cn ${tag} %cg${doneNote}%cn`,
        W,
      ));
    } else {
      const summary = clipVis(progressSummary(budget), SUMMARY_W);
      lines.push(clipVis(
        `  %ch[~]%cn ${tag} %cy${summary}%cn`,
        W,
      ));
    }
  }

  lines.push(footer());
  lines.push(...dashboardGuide(char));

  lines.push(divider(null));
  if (char.notes && char.notes.length > 0) {
    lines.push("%chNotes:%cn");
    for (const n of char.notes) {
      const vis = n.isPublic ? "%cg(public)%cn" : "(private)";
      lines.push(clipVis(
        `  ${padVis(n.name, 20)} ${vis}`,
        W,
      ));
    }
  } else {
    lines.push(clipVis(
      "%chNotes:%cn  none -- %ch+notes/set bg=<text>%cn to add",
      W,
    ));
  }

  return lines.join("%r");
}

/** Complete-row caption; flags optional follow-ups for new players. */
function stepDoneNote(char: IWoDChar, step: number): string {
  if (step === 5) {
    const hasMF =
      Object.keys(char.merits ?? {}).length > 0 ||
      Object.keys(char.flaws ?? {}).length > 0;
    return hasMF
      ? "Done"
      : "Done -- merits/flaws still optional";
  }
  if (step === 6) {
    const left = char.freebiesRemaining ?? 0;
    return left > 0 ? `Done (${left} unspent)` : "Done";
  }
  return "Done";
}

/**
 * Newbie-facing guide under the step list.
 * Leads with how to finish; catalogs second.
 */
function dashboardGuide(char: IWoDChar): string[] {
  const lines: string[] = [];
  const step = char.chargenStep;
  const s5 = validateStep(char, 5);
  const s6 = validateStep(char, 6);
  const fb = char.freebiesRemaining ?? 0;
  const allDone = [1, 2, 3, 4, 5, 6].every((n) =>
    validateStep(char, n as 1 | 2 | 3 | 4 | 5 | 6).complete
  );

  // -- Finish path (always first; this is what players ask about) ----------
  lines.push(divider("How to finish"));
  if (char.status === "submitted") {
    lines.push(clipVis(
      "  Sheet is with staff. Wait for approval (not a job ticket).",
      W,
    ));
    lines.push(clipVis(
      "  %ch+sheet%cn to review. Staff use +chargen/queue.",
      W,
    ));
  } else if (char.status === "approved") {
    lines.push(clipVis(
      "  Chargen complete -- you are cleared to play.",
      W,
    ));
  } else if (char.status === "denied") {
    lines.push(clipVis(
      "  Denied -- fix notes from staff, then +chargen/submit again.",
      W,
    ));
  } else if (allDone) {
    lines.push(clipVis(
      "  All required steps green. Review, then send to staff:",
      W,
    ));
    lines.push(clipVis(
      "  %ch+sheet%cn                 check your character",
      W,
    ));
    lines.push(clipVis(
      "  %ch+chargen/submit%cn         send sheet for staff review",
      W,
    ));
    lines.push(clipVis(
      "  (Does NOT open a job. Staff get a queue ping.)",
      W,
    ));
  } else if (!s6.complete && step >= 6) {
    lines.push(clipVis(
      `  Step 6 freebies: %ch${fb}%cn pts left in the bank.`,
      W,
    ));
    lines.push(clipVis(
      "  %ch+chargen/spend X=n%cn      buy dots (optional)",
      W,
    ));
    lines.push(clipVis(
      "  %ch+chargen/done%cn           close freebies (keep leftover)",
      W,
    ));
    lines.push(clipVis(
      "  Then %ch+chargen/submit%cn    send sheet to staff",
      W,
    ));
    lines.push(clipVis(
      "  /done is NOT submit. /submit is the real finish.",
      W,
    ));
  } else {
    lines.push(clipVis(
      "  Work the yellow [~] step with +chargen/set …",
      W,
    ));
    lines.push(clipVis(
      "  When all six are green: +sheet, then +chargen/submit.",
      W,
    ));
  }

  lines.push(clipVis(
    "Yellow = work left. Green = that step's required bits done.",
    W,
  ));

  // Single catalog list
  lines.push(divider("Browse"));
  lines.push(clipVis(
    "  %ch+chargen/traits%cn     names you can /set right now",
    W,
  ));
  lines.push(clipVis(
    "  %ch+chargen/bglist%cn     backgrounds (Step 5, required)",
    W,
  ));
  if (char.splat === "wta") {
    lines.push(clipVis(
      "  %ch+chargen/giftlist%cn   starting gifts (Step 5, required)",
      W,
    ));
  }
  lines.push(clipVis(
    "  %ch+chargen/meritlist%cn  merits by category (optional)",
    W,
  ));
  lines.push(clipVis(
    "  %ch+chargen/flawlist%cn   flaws by category (optional)",
    W,
  ));
  lines.push(clipVis(
    "  %ch+chargen/freebies%cn   freebie bank & spend ledger",
    W,
  ));
  lines.push(clipVis(
    "  %ch+notes%cn / %ch+notes/set name=text%cn  story notes",
    W,
  ));
  if (char.splat === "wta") {
    lines.push(clipVis(
      "  %ch+background/info <slug>%cn  full background write-up",
      W,
    ));
  }

  if (step >= 4 || s5.complete) {
    lines.push(divider("Optional extras"));
    lines.push(clipVis(
      "  Merits/flaws optional. Language(Spanish)=1  merit=Name",
      W,
    ));
    lines.push(clipVis(
      "  bg focus: Contacts(Street Cops)=3",
      W,
    ));
  }

  lines.push(clipVis(
    "  More: %ch+help chargen/steps%cn",
    W,
  ));

  return lines;
}

/** True when step N-1 is complete (same gate as +chargen/set). */
export function canAccessStep(char: IWoDChar, step: number): boolean {
  if (step <= 1) return true;
  const prev = (step - 1) as 1 | 2 | 3 | 4 | 5;
  return validateStep(char, prev).complete;
}

/**
 * Splat-aware backgrounds catalog for +chargen/bglist.
 * Defaults to what you can buy now (Step 5+). Use /all to force full.
 */
export async function formatBackgroundList(
  char: IWoDChar,
  opts: { all?: boolean } = {},
): Promise<string> {
  const splat = SplatRegistry.get(char.splat);
  const showAll = opts.all === true;
  if (!showAll && !canAccessStep(char, 5)) {
    return frame("Backgrounds", [
      "  Backgrounds unlock at %chStep 5%cn (Advantages).",
      "  Finish earlier steps first, then +chargen/bglist.",
      "  Full catalog anytime: %ch+chargen/bglist all%cn",
    ]);
  }

  const title = showAll
    ? `Backgrounds (all) -- ${splat?.name ?? char.splat}`
    : `Backgrounds (chargen) -- ${splat?.name ?? char.splat}`;
  const lines: string[] = [header(title)];

  // Tribe-hard gates: restricted list means max 1 without staff —
  // still list them; note the gate. Pure banned not used.
  const ext = splat?.ext as IWtaSplatExt | undefined;
  const tribeDef = ext?.tribes?.find((t) => t.id === char.tribe);
  const restricted = new Set(
    tribeDef?.backgroundRestrictions?.restricted ?? [],
  );

  if (char.splat === "wta" || char.splat === "kinfolk") {
    const { allBackgrounds } = await import(
      "../splats/wta/data/backgrounds.ts"
    );
    let xs = allBackgrounds();
    // Kinfolk: still show WtA list; chargen accepts free-text names.
    for (const b of xs) {
      const gateBits: string[] = [];
      if (b.restrictedTo && b.restrictedTo.length > 0) {
        gateBits.push(`[${b.restrictedTo.join(", ")}]`);
      }
      if (restricted.has(b.name)) {
        gateBits.push("max 1");
      }
      const gate = gateBits.length
        ? ` %ch${gateBits.join(" ")}%cn`
        : "";
      lines.push(clipVis(
        `  %ch${padVis(b.name, 14)}%cn  ${b.slug}${gate}`,
        W,
      ));
    }
    lines.push(divider(null));
    lines.push(clipVis(
      "  Set: %ch+chargen/set Allies=2%cn  " +
        "or %chContacts(Street Cops)=3%cn",
      W,
    ));
    lines.push(clipVis(
      "  Detail: %ch+background/info <slug>%cn",
      W,
    ));
  } else if (char.splat === "vtm") {
    const vext = splat?.ext as IVtmSplatExt | undefined;
    const names = vext?.backgrounds ?? [];
    if (names.length === 0) {
      lines.push("  No backgrounds catalog for this splat.");
    } else {
      for (let i = 0; i < names.length; i += 3) {
        const cells = [0, 1, 2].map((o) => {
          const n = names[i + o];
          return n ? padVis(n, 24) : "";
        });
        lines.push(clipVis(`  ${cells.join("").trimEnd()}`, W));
      }
      lines.push(divider(null));
      lines.push(clipVis(
        "  Set: %ch+chargen/set Allies=2%cn (dots 0-5)",
        W,
      ));
    }
  } else {
    const common = [
      "Allies", "Contacts", "Fame", "Influence",
      "Mentor", "Resources", "Retainers", "Status",
    ];
    for (let i = 0; i < common.length; i += 3) {
      const cells = [0, 1, 2].map((o) => {
        const n = common[i + o];
        return n ? padVis(n, 24) : "";
      });
      lines.push(clipVis(`  ${cells.join("").trimEnd()}`, W));
    }
    lines.push(divider(null));
    lines.push(clipVis(
      "  Set: %ch+chargen/set Resources=3%cn",
      W,
    ));
  }

  const left = splat?.backgroundDots ?? 5;
  const spent = Object.values(char.backgrounds ?? {})
    .reduce((s, v) => s + v, 0);
  lines.push(clipVis(
    `  Budget: %ch${spent}%cn / %ch${left}%cn dots spent`,
    W,
  ));
  lines.push(footer());
  return lines.join("%r");
}

/**
 * Gift list for +chargen/giftlist.
 * Default: only beginning gifts for your breed/auspice/tribe (chargen).
 * Pass rank or "all" to browse the full gift table.
 */
export async function formatGiftList(
  char: IWoDChar,
  pool?: string,
  rank?: number | "all",
): Promise<string> {
  const splat = SplatRegistry.get(char.splat);
  const ext = splat?.ext as IWtaSplatExt | undefined;
  if (!ext?.gifts) return "No gifts available for this splat.";

  const showAll = rank === "all" ||
    (typeof rank === "number" && rank >= 1);
  const chargenMode = !showAll;

  if (chargenMode && !canAccessStep(char, 5)) {
    return frame("Gifts", [
      "  Starting gifts unlock at %chStep 5%cn (Advantages).",
      "  Finish Steps 1-4 first, then +chargen/giftlist.",
      "  Full table: %ch+chargen/giftlist all%cn",
    ]);
  }

  if (chargenMode && (!char.breed || !char.auspice || !char.tribe)) {
    return frame("Gifts", [
      "  Set breed, auspice, and tribe first (Step 1).",
      "  Then +chargen/giftlist shows your three starting pools.",
    ]);
  }

  const breedDef = ext.breeds?.find((b) => b.id === char.breed);
  const auspiceDef = ext.auspices?.find((a) => a.id === char.auspice);
  const tribeDef = ext.tribes?.find((t) => t.id === char.tribe);

  type PoolRow = { label: string; names: string[]; slot: string };
  const pools: PoolRow[] = [];

  if (chargenMode) {
    // Only the three beginning gift pools for this character.
    const want = (pool ?? "").toLowerCase();
    if (!want || want === "breed") {
      pools.push({
        label: `Breed -- ${breedDef?.name ?? char.breed}`,
        names: breedDef?.beginningGifts ?? [],
        slot: "breed",
      });
    }
    if (!want || want === "auspice") {
      pools.push({
        label: `Auspice -- ${auspiceDef?.name ?? char.auspice}`,
        names: auspiceDef?.beginningGifts ?? [],
        slot: "auspice",
      });
    }
    if (!want || want === "tribe") {
      pools.push({
        label: `Tribe -- ${tribeDef?.displayName ?? char.tribe}`,
        names: tribeDef?.beginningGifts ?? [],
        slot: "tribe",
      });
    }
  } else {
    // Full table by source id (legacy / staff browse).
    const KNOWN = ["breed", "auspice", "tribe"];
    const ids: Array<{ id: string; label: string }> = [];
    if (!pool || pool === "breed") {
      if (char.breed) {
        ids.push({
          id: char.breed,
          label: `Breed (${char.breed})`,
        });
      }
    }
    if (!pool || pool === "auspice") {
      if (char.auspice) {
        ids.push({
          id: char.auspice,
          label: `Auspice (${char.auspice})`,
        });
      }
    }
    if (!pool || pool === "tribe") {
      if (char.tribe) {
        ids.push({
          id: char.tribe,
          label: `Tribe (${char.tribe})`,
        });
      }
    }
    if (pool && !KNOWN.includes(pool)) {
      ids.push({ id: pool, label: pool });
    }
    const rankN = typeof rank === "number" ? rank : undefined;
    for (const { id, label } of ids) {
      const gifts = Object.values(ext.gifts)
        .filter((g) =>
          g.source.includes(id) &&
          (rankN === undefined || g.level === rankN)
        )
        .sort((a, b) => a.name.localeCompare(b.name));
      pools.push({
        label,
        names: gifts.map((g) => g.name),
        slot: id,
      });
    }
  }

  const head = chargenMode
    ? "Starting Gifts (chargen)"
    : `Gift List${typeof rank === "number" ? ` -- Rank ${rank}` : " (all)"}`;
  const lines: string[] = [header(head)];

  if (pools.length === 0) {
    lines.push("  No pools to display.");
    lines.push(footer());
    return lines.join("%r");
  }

  const chosen = char.gifts ?? [];
  for (let p = 0; p < pools.length; p++) {
    const { label, names, slot } = pools[p];
    if (p > 0) lines.push("");
    lines.push(divider(label));
    if (names.length === 0) {
      lines.push("  (none -- finish Step 1 first)");
      continue;
    }
    for (let r = 0; r < names.length; r += 3) {
      let line = "";
      for (let c = 0; c < 3; c++) {
        const [cw, trail] = COL_LAYOUT[c];
        const name = names[r + c] ?? "";
        const mark = name && chosen.some((g) =>
          g.toLowerCase() === name.toLowerCase()
        )
          ? "*"
          : "";
        const cell = clipVis(mark + name, cw);
        line += c < 2 ? padVis(cell, cw + trail) : cell;
      }
      lines.push(clipVis(line.trimEnd(), W));
    }
  }

  lines.push(divider(null));
  if (chargenMode) {
    lines.push(clipVis(
      "  Set: %ch+chargen/set gift=<Gift Name>%cn  (* = chosen)",
      W,
    ));
    lines.push(clipVis(
      "  Full table: %ch+chargen/giftlist all%cn",
      W,
    ));
  }
  lines.push(footer());
  return lines.join("%r");
}

/**
 * Merits list — terminal-safe.
 *   bare            category index (counts only)
 *   <category>      compact name+cost grid for that cat
 *   <category> all  same, including unaffordable
 */
export function formatMeritList(
  char: IWoDChar,
  category?: string,
  opts: { all?: boolean } = {},
): string {
  const splat = SplatRegistry.get(char.splat);
  if (!splat?.merits?.length) {
    return `No merit list for ${splat?.name ?? char.splat}.`;
  }
  if (!opts.all && !canAccessStep(char, 5)) {
    return frame("Merits", [
      "  Merits unlock at %chStep 5%cn (use freebies).",
      "  Then: %ch+chargen/meritlist%cn  (pick a category)",
    ]);
  }

  const fb = char.freebiesRemaining ?? 0;
  const owned = new Set(Object.keys(char.merits ?? {}));
  const cat = (category ?? "").trim().toLowerCase();

  // No category: index only (fits one screen)
  if (!cat || cat === "all") {
    return formatMeritIndex(splat.name, splat.merits, fb, owned, opts.all);
  }

  let list = splat.merits.filter((m) =>
    m.category.toLowerCase() === cat
  );
  if (list.length === 0) {
    const cats = uniqueCats(splat.merits.map((m) => m.category));
    return frame("Merits", [
      `  Unknown category %ch${category}%cn.`,
      `  Try: ${cats.join(", ")}`,
    ]);
  }

  if (!opts.all) {
    list = list.filter((m) => owned.has(m.name) || m.cost <= fb);
  }

  const scope = opts.all ? "all" : `affordable, ${fb} FB`;
  const title = `Merits / ${list[0]?.category ?? cat} (${scope})`;
  const lines: string[] = [header(title)];
  if (list.length === 0) {
    lines.push(clipVis(
      `  None affordable here (${fb} freebies). ` +
        `%ch+chargen/meritlist ${cat} all%cn`,
      W,
    ));
  } else {
    const ownedBases = new Set(
      [...owned].map((k) => k.replace(/\s*\([^)]*\)\s*$/, "").trim()),
    );
    lines.push(
      ...compactTraitGrid(
        list.map((m) => ({
          label: m.needsDetail
            ? `${m.name}? (${m.cost})`
            : `${m.name} (${m.cost})`,
          mark: ownedBases.has(m.name) || owned.has(m.name),
        })),
      ),
    );
  }
  lines.push(divider(null));
  lines.push(clipVis(
    "  Set: %ch+chargen/set merit=<Name>%cn  (* = owned)",
    W,
  ));
  lines.push(clipVis(
    "  Needs detail (?): %chLanguage(Spanish)=1%cn",
    W,
  ));
  lines.push(clipVis(
    "  Cats: %ch+chargen/meritlist%cn   " +
      "Unaffordable: %ch… <cat> all%cn",
    W,
  ));
  lines.push(footer());
  return lines.join("%r");
}

/**
 * Flaws list — same pattern as merits (index → category grid).
 */
export function formatFlawList(
  char: IWoDChar,
  category?: string,
  opts: { all?: boolean } = {},
): string {
  const splat = SplatRegistry.get(char.splat);
  if (!splat?.flaws?.length) {
    return `No flaw list for ${splat?.name ?? char.splat}.`;
  }
  if (!opts.all && !canAccessStep(char, 5)) {
    return frame("Flaws", [
      "  Flaws unlock at %chStep 5%cn.",
      "  Then: %ch+chargen/flawlist%cn  (pick a category)",
    ]);
  }

  const owned = char.flaws ?? {};
  const ownedNames = new Set(Object.keys(owned));
  const ownedBonus = Object.values(owned)
    .reduce((s, v) => s + v, 0);
  const room = Math.max(0, 7 - ownedBonus);
  const cat = (category ?? "").trim().toLowerCase();

  if (!cat || cat === "all") {
    return formatFlawIndex(splat.name, splat.flaws, room, ownedNames, opts.all);
  }

  let list = splat.flaws.filter((f) =>
    f.category.toLowerCase() === cat
  );
  if (list.length === 0) {
    const cats = uniqueCats(splat.flaws.map((f) => f.category));
    return frame("Flaws", [
      `  Unknown category %ch${category}%cn.`,
      `  Try: ${cats.join(", ")}`,
    ]);
  }

  if (!opts.all) {
    list = list.filter((f) =>
      ownedNames.has(f.name) || f.bonus <= room
    );
  }

  const scope = opts.all ? "all" : `room ${room}/7`;
  const title = `Flaws / ${list[0]?.category ?? cat} (${scope})`;
  const lines: string[] = [header(title)];
  if (list.length === 0) {
    lines.push(clipVis(
      `  None fit remaining flaw room (${room}/7). ` +
        `%ch+chargen/flawlist ${cat} all%cn`,
      W,
    ));
  } else {
    lines.push(
      ...compactTraitGrid(
        list.map((f) => ({
          label: `${f.name} (+${f.bonus})`,
          mark: ownedNames.has(f.name),
        })),
      ),
    );
  }
  lines.push(divider(null));
  lines.push(clipVis(
    "  Set: %ch+chargen/set flaw=<Name>%cn  (* = owned)",
    W,
  ));
  lines.push(clipVis(
    "  Cats: %ch+chargen/flawlist%cn   " +
      "All in cat: %ch… <cat> all%cn",
    W,
  ));
  lines.push(footer());
  return lines.join("%r");
}

function uniqueCats(cats: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of cats) {
    const k = c.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(c);
  }
  return out;
}

function formatMeritIndex(
  splatName: string,
  merits: { name: string; cost: number; category: string }[],
  fb: number,
  owned: Set<string>,
  showAll?: boolean,
): string {
  const cats = uniqueCats(merits.map((m) => m.category));
  const lines: string[] = [
    header(`Merits -- ${splatName} (${fb} freebies)`),
    clipVis("  Pick a category (one screen each):", W),
    "",
  ];
  for (const c of cats) {
    const inCat = merits.filter((m) =>
      m.category.toLowerCase() === c.toLowerCase()
    );
    const n = showAll
      ? inCat.length
      : inCat.filter((m) => owned.has(m.name) || m.cost <= fb).length;
    const slug = c.toLowerCase();
    lines.push(clipVis(
      `  %ch${padVis(c, 14)}%cn ${padVis(String(n), 3)}  ` +
        `%ch+chargen/meritlist ${slug}%cn`,
      W,
    ));
  }
  if (owned.size > 0) {
    lines.push("");
    lines.push(clipVis(
      `  Owned: %ch${[...owned].join(", ")}%cn`,
      W,
    ));
  }
  lines.push(divider(null));
  lines.push(clipVis(
    "  Set: %ch+chargen/set merit=<Name>%cn",
    W,
  ));
  lines.push(clipVis(
    "  Optional extras -- skip if you want a plain sheet.",
    W,
  ));
  lines.push(footer());
  return lines.join("%r");
}

function formatFlawIndex(
  splatName: string,
  flaws: { name: string; bonus: number; category: string }[],
  room: number,
  owned: Set<string>,
  showAll?: boolean,
): string {
  const cats = uniqueCats(flaws.map((f) => f.category));
  const lines: string[] = [
    header(`Flaws -- ${splatName} (room ${room}/7)`),
    clipVis("  Pick a category (one screen each):", W),
    "",
  ];
  for (const c of cats) {
    const inCat = flaws.filter((f) =>
      f.category.toLowerCase() === c.toLowerCase()
    );
    const n = showAll
      ? inCat.length
      : inCat.filter((f) => owned.has(f.name) || f.bonus <= room).length;
    const slug = c.toLowerCase();
    lines.push(clipVis(
      `  %ch${padVis(c, 14)}%cn ${padVis(String(n), 3)}  ` +
        `%ch+chargen/flawlist ${slug}%cn`,
      W,
    ));
  }
  if (owned.size > 0) {
    lines.push("");
    lines.push(clipVis(
      `  Owned: %ch${[...owned].join(", ")}%cn`,
      W,
    ));
  }
  lines.push(divider(null));
  lines.push(clipVis(
    "  Set: %ch+chargen/set flaw=<Name>%cn  (max +7 from flaws)",
    W,
  ));
  lines.push(footer());
  return lines.join("%r");
}

/** 2-column name grid; mark owned with *. Fits ~20 items / screen. */
function compactTraitGrid(
  items: { label: string; mark: boolean }[],
): string[] {
  const COL = 36; // 2 + 36 + 2 + 36 = 76
  const lines: string[] = [];
  for (let i = 0; i < items.length; i += 2) {
    const a = items[i]!;
    const b = items[i + 1];
    const left = clipVis(
      (a.mark ? "*" : " ") + a.label,
      COL,
    );
    if (!b) {
      lines.push(clipVis(` ${padVis(left, COL)}`, W));
      continue;
    }
    const right = clipVis(
      (b.mark ? "*" : " ") + b.label,
      COL,
    );
    lines.push(clipVis(
      ` ${padVis(left, COL)}  ${right}`,
      W,
    ));
  }
  return lines;
}

/** Staff queue listing for +chargen/queue. */
export async function formatQueue(chars: IWoDChar[]): Promise<string> {
  if (chars.length === 0) return "%chNo characters pending review.%cn";
  // 2 + 20 + 1 + 8 + 1 + 12 + 1 + tribe(rest) = 78
  const PW = 20, SW = 8, AW = 12;
  const TW = W - 2 - PW - 1 - SW - 1 - AW - 1;
  const hdr =
    `${padVis("Player", PW)} ${padVis("Splat", SW)} ` +
    `${padVis("Auspice", AW)} Tribe`;
  const lines: string[] = [
    header("Pending Character Applications"),
    `  ${hdr}`,
    `  ${"-".repeat(W - 2)}`,
  ];
  chars.forEach((c) => {
    const splat = SplatRegistry.get(c.splat);
    const ext = splat?.ext as IWtaSplatExt | undefined;
    const tribe = ext?.tribes?.find((t) => t.id === c.tribe)
      ?.displayName ?? c.tribe ?? "-";
    const auspice = ext?.auspices?.find((a) => a.id === c.auspice)
      ?.name ?? c.auspice ?? "-";
    lines.push(
      `  ${padVis(String(c.playerId), PW)} ` +
        `${padVis(String(c.splat), SW)} ` +
        `${padVis(String(auspice), AW)} ` +
        `${clipVis(String(tribe), TW)}`,
    );
  });
  return lines.join("%r");
}

/** Render all three rule styles for visual preview. */
export async function formatRulesPreview(): Promise<string> {
  return [
    header("Page Header (header)"),
    divider("Section Divider (divider)"),
    footer(),
  ].join("%r");
}

/**
 * Format a dice roll as two lines:
 *   pub  -- shown to the room: no individual dice, just the result.
 *   priv -- shown to the roller: includes pool values and each die.
 */
export function formatRoll(
  roll: IDiceRoll,
  resolution: { pubLabel: string; privLabel: string },
  rollerName: string,
): { pub: string; priv: string } {
  const prefix = `%ch%cyRoll>%cn`;
  const diff   = `vs %ch${roll.difficulty}%cn`;
  const spec   = roll.specialty ? " (spec)" : "";

  // Result tag
  let result: string;
  if (roll.botch) {
    result = `%ch%crBotch!%cn`;
  } else if (roll.netSuccesses === 0) {
    result = `%cyFailure%cn`;
  } else {
    const tag = roll.exceptional ? "%ch%cgExceptional! %cn" : "";
    result = `${tag}%cg${roll.netSuccesses} Success(es)%cn`;
  }

  // Dice string for private view -- colored per outcome
  const diceStr = "(" + roll.dice.map((d) => {
    if (d === 1)              return `%cr${d}%cn`;
    if (d >= roll.difficulty) return d === 10 ? `%ch%cg${d}%cn` : `%cg${d}%cn`;
    return String(d);
  }).join(" ") + ")";

  const pub  = `${prefix} ${rollerName} rolls %ch${resolution.pubLabel}%cn ${diff}${spec} => ${result}.`;
  const priv = `${prefix} ${rollerName} rolls %ch${resolution.privLabel}%cn ${diff}${spec} => ${diceStr} ${result}.`;

  return { pub, priv };
}

/** Color a damage type label for display. */
function colorDamageType(type: DamageMark): string {
  if (type === "B") return `%cy`;
  if (type === "L") return `%cr`;
  if (type === "A") return `%ch%cr`;
  return "";
}

/** Render a full health track as colored bracketed cells. */
export function coloredTrack(track: DamageMark[]): string {
  return track.map((m) => {
    if (m === "B") return `%cy[/]%cn`;
    if (m === "L") return `%cr[X]%cn`;
    if (m === "A") return `%ch%cr[*]%cn`;
    return `[ ]`;
  }).join(" ");
}

/**
 * Format a +hurt result line.
 *   actorName -- who applied the damage (may equal targetName for self)
 *   targetName -- who received it
 */
export function formatHurt(
  actorName: string,
  targetName: string,
  amount: number,
  type: DamageMark,
  track: DamageMark[],
  overflow: number,
  overflowLabel = "Incapacitated",
  incapLabel = "Incapacitated",
): string {
  const prefix   = `%ch%crHurt>%cn`;
  const typeCol  = colorDamageType(type);
  const typeName = type === "B" ? "bashing" : type === "L" ? "lethal" : "aggravated";
  const who      = actorName === targetName
    ? `%ch${targetName}%cn takes`
    : `%ch${actorName}%cn hurts %ch${targetName}%cn --`;

  let stateNote = "";
  if (overflow > 0) {
    stateNote = ` %ch%cr-- ${overflowLabel}!%cn`;
  } else if (track.every((m) => m !== "")) {
    // Track fully filled -- bashing-only = unconscious, any lethal/agg = splat label
    const worst = track[0]; // heaviest is always at index 0 after compact
    stateNote = worst === "B"
      ? ` %ch%cy-- Unconscious!%cn`
      : ` %ch%cr-- ${incapLabel}!%cn`;
  }

  return `${prefix} ${who} %ch${amount}%cn ${typeCol}${typeName}%cn damage.${stateNote}%r  ${coloredTrack(track)}`;
}

/**
 * Format a +heal result line.
 *   actorName -- who triggered the heal (may equal targetName)
 *   targetName -- who was healed
 *   typeLabel  -- "bashing" / "lethal" / "aggravated" / "" (for "all")
 */
export function formatHeal(
  actorName: string,
  targetName: string,
  healed: number,
  type: DamageMark | "all",
  track: DamageMark[],
): string {
  const prefix   = `%ch%cgHeal>%cn`;
  const typeName = type === "all" ? "" : (type === "B" ? "bashing " : type === "L" ? "lethal " : "aggravated ");
  const typeCol  = type === "all" ? "" : colorDamageType(type);
  const who      = actorName === targetName
    ? `%ch${targetName}%cn heals`
    : `%ch${actorName}%cn heals %ch${targetName}%cn --`;
  return `${prefix} ${who} %ch${healed}%cn ${typeCol}${typeName}%cndamage.%r  ${coloredTrack(track)}`;
}

// -- Internal helpers -------------------------------------------------------

/** Two-col list cell pair; each side clipped to its slot. */
function twoColCell(
  left: string | undefined,
  right: string | undefined,
): string {
  const [cw0, tr0] = COL2_LAYOUT[0];
  const [cw1] = COL2_LAYOUT[1];
  if (!left) return "";
  if (!right) return clipVis(left, W);
  return padVis(clipVis(left, cw0), cw0 + tr0) +
    clipVis(right, cw1);
}

/**
 * Pack parts joined by sep into lines each ≤ width visual cols.
 */
function packSep(
  parts: string[],
  sep: string,
  width: number,
): string[] {
  const out: string[] = [];
  let line = "";
  for (const p of parts) {
    const next = line ? `${line}${sep}${p}` : p;
    if (line && vlen(next) > width) {
      out.push(line);
      line = clipVis(p, width);
    } else {
      line = vlen(next) > width ? clipVis(next, width) : next;
    }
  }
  if (line) out.push(line);
  return out;
}

/**
 * Two equal columns. Each side clipped so the row is ≤ 78.
 */
function cols2(left: string, right: string): string {
  const half = Math.floor(W / 2);
  return padVis(clipVis(left, half), half) +
    clipVis(right, W - half);
}

/**
 * Three equal columns. Each side clipped so the row is ≤ 78.
 */
function cols3(a: string, b: string, c: string): string {
  const col = Math.floor(W / 3);
  const last = W - 2 * col;
  return padVis(clipVis(a, col), col) +
    padVis(clipVis(b, col), col) +
    clipVis(c, last);
}

/**
 * Format a single trait cell content (no trailing spaces).
 * Shows "perm(temp)" only when they differ. Name is clipped so the
 * cell never exceeds contentWidth visual columns.
 */
function fmtCell(
  name: string,
  perm: number,
  temp: number | undefined,
  contentWidth: number,
): string {
  const valStr = (temp !== undefined && temp !== perm)
    ? `${perm}(${temp})`
    : `${perm}`;
  const maxName = Math.max(1, contentWidth - valStr.length - 1);
  const n = clipVis(name, maxName);
  const dots = Math.max(1, contentWidth - vlen(n) - valStr.length);
  return `%ch${n}%cn` + ".".repeat(dots) + `%ch${valStr}%cn`;
}

/** Center a string within exactly `width` visual chars. */
function centerInCol(s: string, width: number): string {
  const clipped = clipVis(s, width);
  const len = vlen(clipped);
  const left = Math.max(0, Math.floor((width - len) / 2));
  const right = Math.max(0, width - len - left);
  return " ".repeat(left) + clipped + " ".repeat(right);
}

/**
 * Three-column trait table.
 * Each column is exactly COL (26) chars wide; total = W (78).
 * Specialty footnotes are appended after all trait rows.
 */
function traitTable(
  labels: [string, string, string],
  groups: [string[], string[], string[]],
  values: Record<string, number>,
  temps: Record<string, number> | undefined,
  specialties: Record<string, string>,
  base: number,
): string {
  // Header row -- each label centered within its column's total width
  const hdr = labels.map((l, i) => {
    const [cw, trail] = COL_LAYOUT[i];
    const total = cw + trail;
    const raw = `%ch${l}%cn`;
    const cell = centerInCol(raw, total);
    return i < 2 ? cell : cell.trimEnd(); // strip trailing on last col
  }).join("");

  const maxLen = Math.max(groups[0].length, groups[1].length, groups[2].length);
  const rows: string[] = [hdr];

  for (let i = 0; i < maxLen; i++) {
    let line = "";
    for (let c = 0; c < 3; c++) {
      const [cw, trail] = COL_LAYOUT[c];
      const trait = groups[c][i];
      if (!trait) {
        if (c < 2) line += " ".repeat(cw + trail); // blank cell, keep alignment
        continue;
      }
      const perm = base + (values[trait] ?? 0);
      const temp = temps?.[trait];
      line += fmtCell(trait, perm, temp, cw) + " ".repeat(trail);
    }
    rows.push(line);
  }

  return rows.join("%r");
}

/**
 * Two-column specialties table.
 * Each cell: "Specialty (Stat)", laid out in two columns with padding.
 */
function specialtiesTable(entries: [string, string][]): string[] {
  const rows: string[] = [];
  for (let i = 0; i < entries.length; i += 2) {
    const [stat0, spec0] = entries[i];
    const left = `${spec0} (${stat0})`;
    const right = entries[i + 1]
      ? `${entries[i + 1][1]} (${entries[i + 1][0]})`
      : undefined;
    rows.push(twoColCell(left, right));
  }
  return rows;
}

/**
 * Two-column merit/flaw table.
 * Left column: Merits (with dot-fill values).
 * Right column: Flaws (with dot-fill values).
 * Rows zip the two lists together; shorter list leaves its cells blank.
 */
function meritsFlawsTable(merits: Record<string, number>, flaws: Record<string, number>): string[] {
  const mEntries = Object.entries(merits).filter(([, v]) => v > 0);
  const fEntries = Object.entries(flaws).filter(([, v]) => v > 0);

  const [cw0, tr0] = COL2_LAYOUT[0];
  const [cw1]      = COL2_LAYOUT[1];

  // Column headers -- centered within each column, matching traitTable style
  const hdr = centerInCol(`%chMerits%cn`, cw0 + tr0) + centerInCol(`%chFlaws%cn`, cw1).trimEnd();

  const nRows = Math.max(mEntries.length, fEntries.length);
  if (nRows === 0) return [hdr];

  const rows: string[] = [hdr];
  for (let i = 0; i < nRows; i++) {
    const left = mEntries[i]
      ? fmtCell(mEntries[i][0], mEntries[i][1], undefined, cw0)
      : "";
    const right = fEntries[i]
      ? fmtCell(fEntries[i][0], fEntries[i][1], undefined, cw1)
      : "";
    rows.push(
      right
        ? padVis(left || " ".repeat(cw0), cw0 + tr0) + right
        : clipVis(left, W),
    );
  }
  return rows;
}

/**
 * Two-column dot-fill table for Backgrounds.
 * Each entry: name + dot-fill + value, laid out in two columns.
 */
function bgTable(
  backgrounds: Record<string, number>,
  details?: Record<string, string>,
): string {
  const entries = Object.entries(backgrounds).filter(([, v]) => v > 0);
  if (entries.length === 0) return "  None";
  const rows: string[] = [];
  for (let i = 0; i < entries.length; i += 2) {
    const [n0, v0] = entries[i];
    const d0 = details?.[n0] ? ` (${details[n0]})` : "";
    let line = fmtCell(n0 + d0, v0, undefined, COL2_LAYOUT[0][0]) +
      " ".repeat(COL2_LAYOUT[0][1]);
    if (entries[i + 1]) {
      const [n1, v1] = entries[i + 1];
      const d1 = details?.[n1] ? ` (${details[n1]})` : "";
      line += fmtCell(n1 + d1, v1, undefined, COL2_LAYOUT[1][0]);
    }
    rows.push(line);
  }
  return rows.join("%r");
}

/**
 * Wrap a list of short items into lines of at most `width` chars,
 * with `indent` prefix, items separated by "  ".
 */
function wrapItems(items: string[], width: number, indent: string): string[] {
  const lines: string[] = [];
  let line = indent;
  for (const item of items) {
    const candidate = vlen(line) === vlen(indent) ? item : `  ${item}`;
    if (
      vlen(line) + vlen(candidate) > width &&
      vlen(line) > vlen(indent)
    ) {
      lines.push(clipVis(line, width));
      line = indent + clipVis(item, width - vlen(indent));
    } else {
      line += candidate;
    }
  }
  if (vlen(line) > vlen(indent)) lines.push(clipVis(line, width));
  return lines;
}

/**
 * Build one health-track display cell: "Bruised.........[ ]" fitting in `width` chars.
 * Damage markers are MUSH-colored.
 */
function fmtHealthCell(level: string, mark: DamageMark, width: number): string {
  const raw  = markChar(mark);
  const cell = raw === "/" ? "%cy[/]%cn" : raw === "X" ? "%cr[X]%cn" : raw === "*" ? "%cr%ch[*]%cn" : "[ ]";
  const dots = Math.max(1, width - level.length - 3); // 3 = visual len of "[X]"
  return `%ch${level}%cn` + ".".repeat(dots) + cell;
}

/** Seven health-track rows, each fitting in COL_LAYOUT[2][0] (26) chars. */
function healthTrackLines(char: IWoDChar): string[] {
  const track = char.healthTrack ?? (Array<DamageMark>(HEALTH_TRACK_SIZE).fill(""));
  return HEALTH_LEVELS.map((level, i) =>
    fmtHealthCell(level, track[i] ?? "", COL_LAYOUT[2][0])
  );
}

/**
 * Three-column pools section lines.
 * Col 1: Rage / Gnosis / Willpower (or just Willpower for non-WtA)
 * Col 2: Renown (WtA only) or empty
 * Col 3: Health track (7 rows)
 */
function poolsSection(char: IWoDChar): string[] {
  const poolCol: string[] = [];
  if (char.splat === "wta") {
    if (isFrenzied(char)) {
      const label = char.frenzyState === "fox" ? "FOX" : "BERSERK";
      poolCol.push(`%cr[FRENZIED: ${label}] %cy${frenzyRemaining(char)}%cn`);
    }
    poolCol.push(fmtCell("Rage",      char.rage ?? 0,     char.rageCurrent,      COL_LAYOUT[0][0]));
    poolCol.push(fmtCell("Gnosis",    char.gnosis ?? 0,   char.gnosisCurrent,    COL_LAYOUT[0][0]));
    poolCol.push(fmtCell("Willpower", char.willpower,      char.willpowerCurrent, COL_LAYOUT[0][0]));
    poolCol.push(char.inUmbra
      ? `Location: %ch%cm<Umbra>%cn`
      : `Location: %chMaterial%cn`);
    const wp = woundPenalty(char);
    if (wp > 0) poolCol.push(`%cyWound penalty: -${wp}%cn`);
    poolCol.push(`%cgRegen: 1 Bashing/turn%cn`);
  } else if (char.splat === "kinfolk") {
    if (char.gnosis) poolCol.push(fmtCell("Gnosis",    char.gnosis, char.gnosisCurrent, COL_LAYOUT[0][0]));
    poolCol.push(fmtCell("Willpower", char.willpower, char.willpowerCurrent, COL_LAYOUT[0][0]));
    const wp = woundPenalty(char);
    if (wp > 0) poolCol.push(`%cyWound penalty: -${wp}%cn`);
  } else if (char.splat === "vtm") {
    if (isFrenzied(char)) {
      const label = char.frenzyState === "fox" ? "ROTSCHRECK" : "FRENZY";
      poolCol.push(`%cr[${label}]%cn`);
    }
    poolCol.push(fmtCell("Blood",     char.bloodMax ?? 0, char.bloodPool,    COL_LAYOUT[0][0]));
    poolCol.push(fmtCell("Willpower", char.willpower,     char.willpowerCurrent, COL_LAYOUT[0][0]));
    poolCol.push(fmtCell("Humanity",  char.humanity ?? 7, undefined,         COL_LAYOUT[0][0]));
    const wp = woundPenalty(char);
    if (wp > 0) poolCol.push(`%cyWound penalty: -${wp}%cn`);
    if (char.inTorpor) poolCol.push(`%crIn Torpor%cn`);
  } else {
    poolCol.push(fmtCell("Willpower", char.willpower, char.willpowerCurrent, COL_LAYOUT[0][0]));
    const wp = woundPenalty(char);
    if (wp > 0) poolCol.push(`%cyWound penalty: -${wp}%cn`);
  }

  const renownCol: string[] = [];
  if (char.splat === "wta") {
    const perm = char.renown ?? { glory: 0, honor: 0, wisdom: 0 };
    const temp = char.renownTemp ?? { glory: 0, honor: 0, wisdom: 0 };
    const rank = char.rank ?? 1;
    const rankName = RANK_NAMES[rank] ?? "";
    renownCol.push(`%chRank:%cn ${rank} (${rankName})`);
    const fmtRen = (name: string, t: number, p: number) => {
      const valStr = `${t}+${p}`;
      const dots = Math.max(1, COL_LAYOUT[1][0] - name.length - valStr.length);
      return `%ch${name}%cn` + ".".repeat(dots) + `%ch${valStr}%cn`;
    };
    renownCol.push(fmtRen("Glory",  temp.glory,  perm.glory));
    renownCol.push(fmtRen("Honor",  temp.honor,  perm.honor));
    renownCol.push(fmtRen("Wisdom", temp.wisdom, perm.wisdom));
    if (rank < 5 && normaliseAuspice(char.auspice)) {
      const req = nextRankRequirement(char);
      const shortG = req.have.glory  < req.needed.glory;
      const shortH = req.have.honor  < req.needed.honor;
      const shortW = req.have.wisdom < req.needed.wisdom;
      if (shortG || shortH || shortW) {
        renownCol.push(`%cyNext: G ${req.have.glory}/${req.needed.glory}` +
          ` H ${req.have.honor}/${req.needed.honor}` +
          ` W ${req.have.wisdom}/${req.needed.wisdom}%cn`);
      }
    }
  }

  const healthCol = healthTrackLines(char);
  const nRows = Math.max(poolCol.length, renownCol.length, healthCol.length);

  const rows: string[] = [];
  for (let i = 0; i < nRows; i++) {
    const c1 = poolCol[i]   ?? "";
    const c2 = renownCol[i] ?? "";
    const c3 = healthCol[i] ?? "";
    rows.push(
      padVis(clipVis(c1, COL_LAYOUT[0][0]), COL_LAYOUT[0][0] + COL_LAYOUT[0][1]) +
      padVis(clipVis(c2, COL_LAYOUT[1][0]), COL_LAYOUT[1][0] + COL_LAYOUT[1][1]) +
      clipVis(c3, COL_LAYOUT[2][0]),
    );
  }

  return rows;
}

function progressSummary(budget: IStepBudget): string {
  const issue = budget.issues[0] ?? "";

  // Validator issues embed the command in parens or after a colon.
  // Keep spaces inside the command; drop a trailing ")" only.
  const cmdIdx = issue.indexOf("+chargen/");
  if (cmdIdx !== -1) {
    let cmd = issue.slice(cmdIdx);
    const paren = cmd.indexOf(")");
    if (paren !== -1) cmd = cmd.slice(0, paren);
    return cmd.trim();
  }

  // Map common bare issues to actionable commands.
  if (/concept.*required/i.test(issue))   return "+chargen/set concept=<your concept>";
  if (/breed.*required/i.test(issue))     return "+chargen/set breed=homid|lupus|metis";
  if (/auspice.*required/i.test(issue))   return "+chargen/set auspice=ahroun";
  if (/tribe.*required/i.test(issue))     return "+chargen/set tribe=<tribe>";
  if (/deformity/i.test(issue))           return "+chargen/set deformity=<description>";
  if (/background/i.test(issue)) {
    return "+chargen/bglist  then  +chargen/set <Name>=<dots>";
  }
  if (/renown/i.test(issue))              return "+chargen/set renown=glory/honor/wisdom";
  if (/gift/i.test(issue)) {
    return "+chargen/set gift=<Name>  (see +chargen/giftlist)";
  }
  if (/freebie/i.test(issue)) {
    const n = budget.remaining.freebies;
    if (typeof n === "number" && n > 0) {
      return `${n} pts left -- /spend or /done`;
    }
    return "+chargen/spend X=n  or  +chargen/done";
  }

  // Remaining dots -- show a generic command with the group name.
  for (const [key, rem] of Object.entries(budget.remaining)) {
    if (rem > 0) return `+chargen/set <${key.replace("Dots", "")} trait>=<dots>`;
  }

  return issue || "+chargen";
}

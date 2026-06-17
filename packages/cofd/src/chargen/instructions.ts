// Renders character generation per-stage instructions, current values, and progress.

import { header, footer, divider } from "@ursamu/ursamu";
import {
  COFD_MENTAL_SKILLS,
  COFD_PHYSICAL_SKILLS,
  COFD_SOCIAL_SKILLS,
  COFD_MERITS,
  splitMeritStorageKey,
} from "../dictionary/index.ts";
import { COFD_TEMPLATES } from "../gamelines/templates.ts";
import {
  getStageName,
  maxStageFor,
  powerLabel,
  startingMeritDots,
  startingPowerDots,
  type CofdCgState,
} from "./state.ts";
import {
  auspiceMoonGift,
  giftStageProgress,
  shadowAffinityGifts,
} from "./gifts.ts";
import { contractStageProgress } from "./contracts.ts";

function ljust(s: string, w: number): string {
  return s + " ".repeat(Math.max(0, w - s.length));
}

/** ljust that ignores %c* color codes when measuring width. */
function vljust(s: string, w: number): string {
  const vis = s.replace(/%c[a-z]/gi, "").length;
  return s + " ".repeat(Math.max(0, w - vis));
}

function formatDots(val: number): string {
  const v = Math.max(0, Math.min(5, val));
  return "%ch%cy" + "*".repeat(v) + "%cn%cx" + ".".repeat(5 - v) + "%cn";
}

/** Visible label "Name: ***.. (N)" padded to width w (color codes don't count). */
function attrCell(label: string, val: number, w: number): string {
  const labelStr = label + ":";
  const tail = " (" + val + ")";
  const visibleLen = labelStr.length + 5 + tail.length; // label+":" + dots(5) + tail
  const pad = Math.max(1, w - visibleLen);
  return `%ch${labelStr}%cn${" ".repeat(pad)}${formatDots(val)}${tail}`;
}

/** "Name(N)" cell, padded to w columns. */
function _skillCell(name: string, val: number, w: number): string {
  const title = name.replace(/\b\w/g, (c) => c.toUpperCase());
  return ljust(`${title}(${val})`, w);
}

/** Render three lists side-by-side as N rows of fixed-width cells. */
function threeColumn(
  left: string[],
  mid: string[],
  right: string[],
  cellW: number,
  gutter = " ",
): string[] {
  const rows = Math.max(left.length, mid.length, right.length);
  const out: string[] = [];
  for (let i = 0; i < rows; i++) {
    const a = left[i] ?? " ".repeat(cellW);
    const b = mid[i] ?? " ".repeat(cellW);
    const c = right[i] ?? " ".repeat(cellW);
    out.push("  " + a + gutter + b + gutter + c);
  }
  return out;
}

/**
 * Generates beautiful CLI instructions, current values, and progress meter.
 */
export async function getStageInstructions(_playerName: string, cgState: CofdCgState): Promise<string> {
  const stage = cgState.stage;
  const sheet = cgState.sheet;
  const tKey = sheet.template.toLowerCase().trim();
  const tmpl = COFD_TEMPLATES[tKey] || COFD_TEMPLATES.mortal;

  const lines: string[] = [];
  lines.push(await header(`CHARACTER CREATION -- STAGE ${stage}: ${getStageName(stage).toUpperCase()}`));

  // Progress Bar -- compact form keeps the line under 78 cols.
  const maxStage = maxStageFor(sheet.template);
  const stageLabels: Record<number, string> = {
    1: "Concept",
    2: "Template",
    3: "Detail",
    4: "Attrs",
    5: "Skills",
    6: "Merits",
    7: "Powers",
    8: "Gifts",
  };
  const stagesList = [];
  for (let s = 1; s <= maxStage; s++) {
    stagesList.push(s);
  }
  const steps = stagesList.map(s => {
    const name = stageLabels[s] ?? "Stage";
    return s === stage ? `%ch%cy[${name}]%cn` : `[${name}]`;
  }).join(" ");
  // The full bracketed bar overflows once an 8th stage is added; fall back to a
  // compact "Stage N/Max" form when it would exceed the 78-column width.
  const barVisible = `  Progress: ` + stagesList.map((s) => `[${stageLabels[s] ?? "Stage"}]`).join(" ");
  if (barVisible.length <= 78) {
    lines.push(`  %chProgress:%cn ${steps}`);
  } else {
    lines.push(`  %chProgress:%cn Stage %ch%cy${stage}%cn of ${maxStage} -- %ch%cy${getStageName(stage)}%cn`);
  }
  lines.push(await divider(""));

  switch (stage) {
    case 1:
      lines.push("  Welcome to character creation! Let's start by defining your core identity.");
      lines.push("  Please set your Concept (overall theme), Virtue (strength), and Vice (flaw).");
      lines.push("");
      lines.push(`    %ch%ccConcept:%cn ${sheet.concept}`);
      lines.push(`    %ch%ccVirtue:%cn  ${sheet.virtue}`);
      lines.push(`    %ch%ccVice:%cn    ${sheet.vice}`);
      lines.push("");
      lines.push("  %chBackstory Note:%cn");
      lines.push("    A great character has depth. Use %ch+notes/add Backstory=<text>%cn to write");
      lines.push("    a detailed background/backstory. This is visible to staff during review.");
      lines.push("");
      lines.push(await divider(""));
      lines.push("  %chCommands:%cn");
      lines.push("    +cg/set concept=<text>   -- Define your character's high-level concept.");
      lines.push("    +cg/set virtue=<text>    -- Define your primary virtue.");
      lines.push("    +cg/set vice=<text>      -- Define your primary vice.");
      lines.push("    +cg/next                 -- Advance to the next stage once done.");
      break;

    case 2:
      lines.push("  Choose your Supernatural Template. This dictates your character's nature.");
      lines.push("  Supported templates: %chmortal%cn, %chchangeling%cn, %chwerewolf%cn.");
      lines.push("");
      lines.push(`    %ch%ccSelected:%cn ${sheet.template.toUpperCase()} (${tmpl.name})`);
      lines.push("");
      lines.push(await divider(""));
      lines.push("  %chCommands:%cn");
      lines.push("    +cg/set template=<name>  -- Set your template (e.g. changeling).");
      lines.push("    +cg/back                 -- Go back to stage 1.");
      lines.push("    +cg/next                 -- Advance to stage 3.");
      break;

    case 3:
      lines.push(`  Configure custom details specific to the %ch${tmpl.name}%cn template.`);
      if (tmpl.customFields.length === 0) {
        lines.push("");
        lines.push("    No template-specific details required for Mortals!");
        lines.push("");
      } else {
        lines.push("");
        for (const f of tmpl.customFields) {
          const title = f.replace(/\b\w/g, c => c.toUpperCase());
          const val = sheet.customFields[f] || "Not Set";
          lines.push(`    %ch%cc${ljust(title + ":", 12)}%cn ${val}`);
        }
        lines.push("");
      }
      lines.push(await divider(""));
      lines.push("  %chCommands:%cn");
      if (tmpl.customFields.length > 0) {
        for (const f of tmpl.customFields) {
          lines.push(`    +cg/set ${f}=<value>    -- Set your character's ${f}.`);
        }
      }
      lines.push("    +cg/back                 -- Go back to stage 2.");
      lines.push("    +cg/next                 -- Advance to stage 4.");
      break;

    case 4: {
      lines.push("  Allocate dots across your Attributes. All start at a baseline of 1.");
      lines.push("  You must allocate your groups so that the EXTRA dots allocated (above 1) sum");
      lines.push("  up to a permutation of the pools: %ch5%cn / %ch4%cn / %ch3%cn dots.");
      lines.push("");

      const atts = sheet.attributes;
      const mExt = (atts.intelligence || 1) - 1 + (atts.wits || 1) - 1 + (atts.resolve || 1) - 1;
      const pExt = (atts.strength || 1) - 1 + (atts.dexterity || 1) - 1 + (atts.stamina || 1) - 1;
      const sExt = (atts.presence || 1) - 1 + (atts.manipulation || 1) - 1 + (atts.composure || 1) - 1;
      const W = 24;
      lines.push(
        "  " +
          vljust(`%ch%ccMental%cn (+${mExt})`, W) + " " +
          vljust(`%ch%ccPhysical%cn (+${pExt})`, W) + " " +
          vljust(`%ch%ccSocial%cn (+${sExt})`, W),
      );
      const col1 = [
        attrCell("Intelligence", atts.intelligence || 1, W),
        attrCell("Wits",         atts.wits || 1,         W),
        attrCell("Resolve",      atts.resolve || 1,      W),
      ];
      const col2 = [
        attrCell("Strength",  atts.strength || 1,  W),
        attrCell("Dexterity", atts.dexterity || 1, W),
        attrCell("Stamina",   atts.stamina || 1,   W),
      ];
      const col3 = [
        attrCell("Presence",     atts.presence || 1,     W),
        attrCell("Manipulation", atts.manipulation || 1, W),
        attrCell("Composure",    atts.composure || 1,    W),
      ];
      for (const r of threeColumn(col1, col2, col3, W)) lines.push(r);
      lines.push("");
      const totalAllocated = mExt + pExt + sExt;

      lines.push(`    %chCurrent extra dots allocated:%cn ${totalAllocated} / 12 dots`);
      lines.push(`    %chAllocations:%cn Mental (+${mExt}), Physical (+${pExt}), Social (+${sExt})`);
      lines.push("");
      lines.push(await divider(""));
      lines.push("  %chCommands:%cn");
      lines.push("    +cg/set <attribute>=<dots>  -- Set a rating (1 to 5).");
      lines.push("    +cg/back                   -- Go back to stage 3.");
      lines.push("    +cg/next                   -- Validate and advance to stage 5.");
      break;
    }

    case 5: {
      lines.push("  Allocate dots across your Skills. Three pools for the three groups:");
      lines.push("  Mental / Physical / Social: %ch11%cn / %ch9%cn / %ch7%cn dots.");
      lines.push("");

      const sks = sheet.skills;
      const mSum = COFD_MENTAL_SKILLS.reduce((acc, s) => acc + (sks[s] || 0), 0);
      const pSum = COFD_PHYSICAL_SKILLS.reduce((acc, s) => acc + (sks[s] || 0), 0);
      const sSum = COFD_SOCIAL_SKILLS.reduce((acc, s) => acc + (sks[s] || 0), 0);
      const totalSkills = mSum + pSum + sSum;

      const W = 24;
      lines.push(
        "  " +
          vljust(`%ch%ccMental%cn (${mSum})`, W) + " " +
          vljust(`%ch%ccPhysical%cn (${pSum})`, W) + " " +
          vljust(`%ch%ccSocial%cn (${sSum})`, W),
      );
      const titleCase = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());
      const col1 = COFD_MENTAL_SKILLS.map((s) => attrCell(titleCase(s), sks[s] || 0, W));
      const col2 = COFD_PHYSICAL_SKILLS.map((s) => attrCell(titleCase(s), sks[s] || 0, W));
      const col3 = COFD_SOCIAL_SKILLS.map((s) => attrCell(titleCase(s), sks[s] || 0, W));
      for (const r of threeColumn(col1, col2, col3, W)) lines.push(r);
      lines.push("");

      lines.push(`    %chCurrent skill dots allocated:%cn ${totalSkills} / 27 dots`);
      lines.push(`    %chAllocations:%cn Mental (${mSum}), Physical (${pSum}), Social (${sSum})`);
      lines.push("");
      lines.push(await divider(""));
      lines.push("  %chCommands:%cn");
      lines.push("    +cg/set <skill>=<dots> -- Set a skill dot rating (0 to 5).");
      lines.push("    +cg/back               -- Go back to stage 4.");
      lines.push("    +cg/next               -- Validate and advance to stage 6.");
      break;
    }

    case 6: {
      const meritBudget = startingMeritDots(sheet.template);
      lines.push("  Allocate starting merits for your character.");
      lines.push(`  You must allocate exactly %ch${meritBudget}%cn merit dots.`);
      lines.push("");

      const MW = 36;
      const allocatedMerits = Object.keys(sheet.merits || {}).reduce((acc, m) => acc + (sheet.merits[m] || 0), 0);
      lines.push(`  %ch%ccMerits%cn (${allocatedMerits} / ${meritBudget})`);
      const activeMeritsList = Object.keys(sheet.merits || {}).filter(m => (sheet.merits[m] || 0) > 0);
      if (activeMeritsList.length === 0) {
        lines.push("  No merits purchased yet.");
      } else {
        for (const mKey of activeMeritsList) {
          const { merit, qualifier } = splitMeritStorageKey(mKey);
          const found = COFD_MERITS.find(m => m.key === merit);
          const base = found ? found.name : merit.replace(/\b\w/g, c => c.toUpperCase());
          const qual = qualifier ? ` (${qualifier.replace(/\b\w/g, c => c.toUpperCase())})` : "";
          const name = base + qual;
          const val = sheet.merits[mKey] || 0;
          lines.push("  " + attrCell(name, val, MW));
        }
      }
      lines.push("");
      lines.push("  %chMerit Details:%cn");
      lines.push("    For merits requiring extra details (e.g. Allies, Contacts, Retainer),");
      lines.push("    use %ch+notes/add <Merit>=<explanation>%cn to document what or who they are.");
      lines.push("");
      lines.push(await divider(""));
      lines.push("  %chCommands:%cn");
      lines.push("    +cg/set <merit>=<dots>  -- Allocate dots (empty = clear).");
      lines.push("    +cg/back                -- Go back to stage 5.");
      if (maxStage === 6) {
        lines.push("    +cg/submit              -- Final review and submit for approval.");
      } else {
        lines.push("    +cg/next                -- Validate and advance to stage 7.");
      }
      break;
    }

    case 7: {
      // Changeling Stage 7 -- discrete Contract selection (gated).
      if (sheet.template === "changeling") {
        const prog = contractStageProgress(sheet);
        const pkg = prog.pkg;
        lines.push("  Choose your starting Contracts. Each must meet its Regalia,");
        lines.push("  court, or goblin requirement.");
        lines.push("");
        lines.push("  %chStarting package:%cn");
        lines.push(`    Common Contracts: %ch${pkg.commonCount}%cn (Common Arcadian, your Court, or Goblin)`);
        lines.push(`      - at least %ch${pkg.favoredCommonMin}%cn from a favored Regalia; at most %ch${pkg.goblinMax}%cn Goblin`);
        lines.push(`    Royal Contracts:  %ch${pkg.royalCount}%cn (Royal Arcadian from a favored Regalia, or your Court)`);
        lines.push("");
        lines.push(`  %chFavored Regalia:%cn ${pkg.favored.length ? pkg.favored.join(", ") : "(set seeming + favored in Stage 3)"}`);
        lines.push(`  %chCourt:%cn ${pkg.court || "(unset)"}`);
        lines.push("");
        lines.push(`  %ch%ccCommon%cn (${prog.common} / ${pkg.commonCount}; favored ${prog.favoredCommon}/${pkg.favoredCommonMin}, goblin ${prog.goblin}/${pkg.goblinMax})   %ch%ccRoyal%cn (${prog.royal} / ${pkg.royalCount})`);
        const list = sheet.contracts ?? [];
        if (list.length === 0) lines.push("    No Contracts chosen yet.");
        else for (const c of list) lines.push(`    %ch%cy${c}%cn`);
        lines.push("");
        lines.push(await divider(""));
        lines.push("  %chCommands:%cn");
        lines.push("    +cg/contract <name>    -- Add a Contract  (browse: +cg/list contracts)");
        lines.push("    +cg/uncontract <name>  -- Remove a chosen Contract");
        lines.push("    +cg/back               -- Go back to stage 6.");
        lines.push("    +cg/submit             -- Final review and submit for approval.");
        break;
      }

      const pName = powerLabel(sheet.template);
      lines.push(`  Allocate starting ${pName.toLowerCase()} specific to your template.`);
      const startingDots = startingPowerDots(sheet.template, sheet.customFields?.tribe);

      lines.push(`  %ch${startingDots}%cn starting ${pName.toLowerCase()} dots.`);
      if (sheet.template === "werewolf") {
        lines.push("  One dot from your auspice, one from your tribe, one of your choice.");
        lines.push("  No single Renown may exceed %ch2%cn dots at creation (Ghost Wolves: 2 total).");
      }
      lines.push("");

      const MW = 36;
      const allocatedPowers = tmpl.validPowers.reduce((acc, p) => acc + (sheet.powers[p] || 0), 0);
      lines.push(`  %ch%cc${pName}%cn (${allocatedPowers} / ${startingDots})`);
      for (const p of tmpl.validPowers) {
        const title = p.replace(/\b\w/g, c => c.toUpperCase());
        const val = sheet.powers[p] || 0;
        lines.push("  " + attrCell(title, val, MW));
      }
      lines.push("");

      lines.push(await divider(""));
      lines.push("  %chCommands:%cn");
      lines.push(`    +cg/set <${sheet.template === "changeling" ? "contract" : sheet.template === "werewolf" ? "renown" : "power"}>=<dots>  -- Allocate dots.`);
      lines.push("    +cg/back                -- Go back to stage 6.");
      if (maxStage === 7) {
        lines.push("    +cg/submit              -- Final review and submit for approval.");
      } else {
        lines.push("    +cg/next                -- Validate and advance to stage 8.");
      }
      break;
    }

    case 8: {
      const prog = giftStageProgress(sheet);
      const pkg = prog.pkg;
      const moon = auspiceMoonGift(sheet);
      const affinity = shadowAffinityGifts(sheet);
      lines.push("  Choose your starting Gifts and Rites. Each Gift facet needs at least");
      lines.push("  one dot in its associated Renown.");
      lines.push("");
      if (pkg) {
        lines.push(`  %chStarting package:%cn`);
        lines.push(`    Moon facets:   up to %ch${pkg.moonMax}%cn from the ${moon?.name ?? "(set auspice)"}`);
        lines.push(`    Shadow facets: %ch${pkg.shadowCount}%cn from distinct ${pkg.ghostWolf ? "Shadow Gifts" : "tribal Gifts"}`);
        if (!pkg.ghostWolf) {
          lines.push(`    Flex facet:    ${pkg.moonMax === 2 ? "2nd Moon facet" : "a Wolf Gift facet"} (1)`);
        } else {
          lines.push(`    Flex facet:    a Wolf Gift facet (1)`);
        }
        lines.push(`    Rites:         %ch${pkg.riteDots}%cn dots`);
        lines.push("");
        const affNames = affinity.length > 6 ? "any Shadow Gift" : affinity.map((g) => g.name).join(", ");
        lines.push(`  %chYour Shadow Gifts:%cn ${affNames}`);
        lines.push("");
        lines.push(`  %chGifts%cn (facets ${prog.moon + prog.shadow + prog.wolf} / ${pkg.totalFacets}: moon ${prog.moon}, shadow ${prog.shadow}, wolf ${prog.wolf})`);
      } else {
        lines.push("  %crSet your auspice (Stage 3) and Renown (Stage 7) first.%cn");
        lines.push("");
        lines.push("  %chGifts%cn");
      }
      const giftList = sheet.gifts ?? [];
      if (giftList.length === 0) lines.push("    No Gift facets chosen yet.");
      else for (const g of giftList) lines.push(`    %ch%cy${g}%cn`);
      lines.push("");
      lines.push(`  %chRites%cn (${prog.riteDots} / ${pkg?.riteDots ?? 2} dots)`);
      const riteList = sheet.rites ?? [];
      if (riteList.length === 0) lines.push("    No Rites chosen yet.");
      else for (const r of riteList) lines.push(`    %ch%cy${r}%cn`);
      lines.push("");
      lines.push(await divider(""));
      lines.push("  %chCommands:%cn");
      lines.push("    +cg/gift <facet>     -- Add a Gift facet  (browse: +cg/list gifts)");
      lines.push("    +cg/ungift <facet>   -- Remove a chosen facet");
      lines.push("    +cg/rite <rite>      -- Add a Rite        (browse: +cg/list rites)");
      lines.push("    +cg/unrite <rite>    -- Remove a chosen Rite");
      lines.push("    +cg/back             -- Go back to stage 7.");
      lines.push("    +cg/submit           -- Final review and submit for approval.");
      break;
    }
  }

  lines.push(await divider(""));
  lines.push("  %chHelper Commands:%cn");
  lines.push("    +cg/reset               -- Discard all changes and restart.");
  lines.push(await footer());

  return lines.join("\n");
}

/**
 * +bodysculpt -- Bodysculpting and Exotic Modification Commands
 */
import { addCmd, DBO } from "@ursamu/mush";
import type { IUrsamuSDK } from "@ursamu/mush";
import { bar, div, hdr, lbl, val, acc, bad, dim, ARR, ERR, OK, row, wrap, grid } from "./chargen.ts";
import type { ICPRCharacter, IBodysculpt } from "../db/schemas.ts";
import { applyHumanityLoss } from "../engine/cyberpsychosis.ts";
import { recalcDerived } from "../engine/character.ts";
import { emitBodysculptCompleted } from "../engine/emitters.ts";

const BODYSCULPT_CATALOG: Array<{
  name: string; description: string; hl: number; exotic: boolean; costEb: number;
}> = [
  { name: "Skin Weave", description: "Metallic or woven-pattern skin.", hl: 2, exotic: false, costEb: 500 },
  { name: "Subdermal Plating", description: "Visible armor plating under skin.", hl: 4, exotic: false, costEb: 1000 },
  { name: "Muscle Sculpting", description: "Visibly enhanced musculature.", hl: 2, exotic: false, costEb: 750 },
  { name: "Skin Pigmentation", description: "Custom skin color/patterns.", hl: 0, exotic: false, costEb: 200 },
  { name: "Tattoo Implants", description: "Bioluminescent or color-shifting tattoos.", hl: 0, exotic: false, costEb: 150 },
  { name: "Feathers", description: "Full-body decorative feathers.", hl: 4, exotic: true, costEb: 5000 },
  { name: "Scales", description: "Reptilian scales across the body.", hl: 4, exotic: true, costEb: 4000 },
  { name: "Fur", description: "Full-body animal fur.", hl: 4, exotic: true, costEb: 3500 },
  { name: "Tail", description: "Functional decorative tail.", hl: 2, exotic: true, costEb: 2000 },
  { name: "Horns", description: "Decorative bony horns.", hl: 2, exotic: true, costEb: 1500 },
  { name: "Cat Eyes", description: "Slit-pupil cosmetic eyes.", hl: 0, exotic: false, costEb: 300 },
  { name: "Fangs", description: "Sharpened or extended canine teeth.", hl: 0, exotic: false, costEb: 250 },
  { name: "Body Reshaping", description: "Major body proportional changes.", hl: 2, exotic: false, costEb: 2000 },
  { name: "Gender Reassignment", description: "Full gender-affirming surgery.", hl: 0, exotic: false, costEb: 5000 },
  { name: "Gills", description: "Functional underwater breathing.", hl: 3, exotic: true, costEb: 8000 },
];

addCmd({
  name: "+bodysculpt",
  pattern: /^\+bodysculpt(?:\/(list|view|get|remove))?\s*(.*)/i,
  lock: "connected",
  category: "Cyberpunk RED",
  help: `+bodysculpt[/<switch>] [<argument>]  -- Bodysculpting and exotic mods.

Switches:
  /list              Browse available modifications.
  /view              Show your current body modifications.
  /get <modification>  Apply a modification (Medtech/Admin only).
  /remove <modification>  Remove a modification (Admin only).

Exotic modifications (marked [EXOTIC]) require special narrative setup.

Examples:
  +bodysculpt/list           See all options.
  +bodysculpt/view           View your mods.
  +bodysculpt/get Scales     Get the Scales modification.`,

  exec: async (u: IUrsamuSDK) => {
    const sw = (u.cmd.args[0] ?? "view").toLowerCase().trim();
    const arg = u.util.stripSubs(u.cmd.args[1] ?? "").trim();
    const cpr = u.me.state.cpr as ICPRCharacter | undefined;
    if (!cpr?.chargenComplete) { u.send(`${ERR}No character found.`); return; }

    if (!sw || sw === "view") { sendBodysculptView(u, cpr); return; }
    if (sw === "list") { sendBodysculptList(u); return; }
    if (sw === "get") { await applyBodysculpt(u, cpr, arg); return; }
    if (sw === "remove") { await removeBodysculpt(u, cpr, arg); return; }
    u.send(`${ERR}Unknown switch ${val("/" + sw)}.`);
  },
});

function sendBodysculptView(u: IUrsamuSDK, cpr: ICPRCharacter): void {
  const lines: string[] = [
    bar(),
    hdr("MEAT -- BODY MODIFICATIONS"),
    bar(),
  ];
  if (cpr.bodysculpt.length === 0) {
    lines.push(`  ${dim("No modifications. Pure unaltered meat.")}`);
  } else {
    for (const mod of cpr.bodysculpt) {
      const exotic = mod.exotic ? `  ${bad("[EXOTIC]")}` : "";
      const hlStr = mod.hl > 0 ? `  ${lbl("HL:")} ${val(mod.hl)}` : "";
      lines.push(`  ${acc(mod.modification)}${hlStr}${exotic}`);
    }
    const totalHL = cpr.bodysculpt.reduce((s, m) => s + m.hl, 0);
    if (totalHL > 0) {
      lines.push(div());
      lines.push(row("TOTAL HUMANITY LOSS", val(totalHL)));
    }
  }
  lines.push(bar());
  u.send(lines.join("\r\n"));
}

function sendBodysculptList(u: IUrsamuSDK): void {
  const lines: string[] = [
    bar(),
    hdr("RIPPERDOC -- BODYSCULPT CATALOG"),
    bar(),
  ];
  for (const mod of BODYSCULPT_CATALOG) {
    const exotic = mod.exotic ? `  ${bad("[EXOTIC]")}` : "";
    const hlStr = mod.hl > 0 ? `  ${lbl("HL:")} ${val(String(mod.hl))}` : "";
    lines.push(`  ${val(mod.name)}${hlStr}${exotic}  ${val(mod.costEb + " eb")}`);
    lines.push(`    ${dim(mod.description)}`);
  }
  lines.push(bar());
  u.send(lines.join("\r\n"));
}

async function applyBodysculpt(u: IUrsamuSDK, cpr: ICPRCharacter, modName: string): Promise<void> {
  const canOperate = cpr.role === "medtech" || u.me.flags.has("admin") || u.me.flags.has("wizard");
  if (!canOperate) { u.send(`${ERR}Only a ripperdoc (Medtech) or admin can perform bodysculpting.`); return; }
  if (!modName) { u.send(`${ARR}Specify modification: ${val("+bodysculpt/get <name>")}`); return; }

  const modDef = BODYSCULPT_CATALOG.find((m) => m.name.toLowerCase() === modName.toLowerCase());
  if (!modDef) { u.send(`${ERR}Unknown modification ${val(modName)}. Type ${val("+bodysculpt/list")}.`); return; }

  if (cpr.bodysculpt.some((m) => m.modification.toLowerCase() === modName.toLowerCase())) {
    u.send(`${ERR}${val(modDef.name)} is already applied.`); return;
  }

  if (cpr.eurodollars < modDef.costEb) {
    u.send(`${ERR}Cost: ${val(modDef.costEb + " eb")}. You have ${dim(cpr.eurodollars + " eb")}.`); return;
  }

  const newMod: IBodysculpt = {
    id: crypto.randomUUID(),
    modification: modDef.name,
    exotic: modDef.exotic,
    hl: modDef.hl,
    completedAt: Date.now(),
    performedBy: u.me.id,
  };

  let updatedCpr = { ...cpr, bodysculpt: [...cpr.bodysculpt, newMod] };
  if (modDef.hl > 0) {
    const hlRes = applyHumanityLoss(updatedCpr, modDef.hl);
    const updatedChar = {
      ...updatedCpr,
      humanityLoss: hlRes.newHL,
      stats: { ...updatedCpr.stats, emp: hlRes.newEMP },
    };
    updatedCpr = recalcDerived({ ...updatedChar, bodysculpt: updatedCpr.bodysculpt });
  }

  await u.db.modify(u.me.id, "$set", {
    "state.cpr.bodysculpt": updatedCpr.bodysculpt,
    "state.cpr.humanityLoss": updatedCpr.humanityLoss,
    "state.cpr.stats": updatedCpr.stats,
    "state.cpr.eurodollars": cpr.eurodollars - modDef.costEb,
  });

  await emitBodysculptCompleted(u.me.id, u.me.name ?? "Unknown", modDef.name, modDef.hl);

  const hlLine = modDef.hl > 0
    ? [``, row("HUMANITY LOSS", `${lbl("HL:")} ${val(modDef.hl)}`), row("EMP", val(updatedCpr.stats.emp))]
    : [];
  u.send([
    div(),
    `  ${OK}Modification applied: ${val(modDef.name)}`,
    row("COST", val(modDef.costEb + " eb")),
    ...hlLine,
    div(),
  ].join("\r\n"));

  if (modDef.exotic) {
    u.send(`  ${ERR}[EXOTIC] This modification requires special narrative documentation.`);
  }
}

async function removeBodysculpt(u: IUrsamuSDK, cpr: ICPRCharacter, modName: string): Promise<void> {
  const isAdmin = u.me.flags.has("admin") || u.me.flags.has("wizard");
  if (!isAdmin) { u.send(`${ERR}Only admins can remove body modifications.`); return; }
  const idx = cpr.bodysculpt.findIndex((m) => m.modification.toLowerCase() === modName.toLowerCase());
  if (idx < 0) { u.send(`${ERR}${val(modName)} not found in modifications.`); return; }
  const removed = cpr.bodysculpt[idx];
  const newList = cpr.bodysculpt.filter((_, i) => i !== idx);
  const recovered = Math.floor(removed.hl / 2);
  const newHL = Math.max(0, cpr.humanityLoss - recovered);
  const recalced = recalcDerived({ ...cpr, bodysculpt: newList, humanityLoss: newHL });
  await u.db.modify(u.me.id, "$set", {
    "state.cpr.bodysculpt": newList,
    "state.cpr.humanityLoss": newHL,
    "state.cpr.stats": recalced.stats,
  });
  u.send([
    div(),
    `  ${OK}Modification removed: ${val(removed.modification)}`,
    row("HUMANITY RECOVERED", val(recovered)),
    div(),
  ].join("\r\n"));
}

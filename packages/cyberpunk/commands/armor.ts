/**
 * +armor -- Armor Management
 */
import { addCmd } from "@ursamu/ursamu";
import type { IUrsamuSDK } from "@ursamu/ursamu";
import type { ICPRCharacter, IArmorState } from "../db/schemas.ts";
import { getArmor } from "../data/armor.ts";
import { ARMOR_CATALOG } from "../data/armor.ts";
import { bar, div, hdr, lbl, val, acc, dim, ARR, ERR, OK, row, grid } from "./chargen.ts";

addCmd({
  name: "+armor",
  pattern: /^\+armor(?:\/(wear|remove|repair|list|view))?\s*(.*)/i,
  lock: "connected",
  category: "Cyberpunk RED",
  help: `+armor[/<switch>] [<argument>]  -- Manage your armor.

Switches:
  /list                Browse available armor.
  /view                Show currently worn armor.
  /wear <name>         Equip armor (body or head slot).
  /remove <body|head>  Strip armor from a slot.
  /repair <body|head>  Patch armor SP (costs EB, needs Tech).

Examples:
  +armor/list              Browse the catalog.
  +armor/wear leather_jacket  Throw on a leather jacket.
  +armor/wear light_armorjack  Strap on an armorjack.
  +armor/view              Check what you're wearing.
  +armor/remove body       Strip your body armor.`,

  exec: async (u: IUrsamuSDK) => {
    const sw  = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const arg = u.util.stripSubs(u.cmd.args[1] ?? "").trim();

    const cpr = u.me.state.cpr as ICPRCharacter | undefined;
    if (!cpr?.chargenComplete) { u.send(`${ERR}No runner data found.`); return; }

    if (!sw || sw === "view") { sendArmorView(u, cpr); return; }
    if (sw === "list")   { sendArmorList(u); return; }
    if (sw === "wear")   { await wearArmor(u, cpr, arg); return; }
    if (sw === "remove") { await removeArmor(u, cpr, arg); return; }
    if (sw === "repair") { await repairArmor(u, cpr, arg); return; }
    u.send(`${ERR}Unknown switch ${val("/" + sw)}. Valid: /list /view /wear /remove /repair`);
  },
});

function sendArmorView(u: IUrsamuSDK, cpr: ICPRCharacter): void {
  u.send([
    bar(),
    hdr("ARMOR"),
    bar(),
    row("MEAT", cpr.armorBody
      ? `${val(cpr.armorBody.name)}  SP ${acc(String(cpr.armorBody.currentSp))}/${dim(String(cpr.armorBody.sp))}  ${dim("pen")} ${val(String(cpr.armorBody.penalty))}`
      : dim("none -- hope nobody shoots you")),
    row("HEAD", cpr.armorHead
      ? `${val(cpr.armorHead.name)}  SP ${acc(String(cpr.armorHead.currentSp))}/${dim(String(cpr.armorHead.sp))}  ${dim("pen")} ${val(String(cpr.armorHead.penalty))}`
      : dim("none")),
    bar(),
  ].join("\r\n"));
}

function sendArmorList(u: IUrsamuSDK): void {
  const lines: string[] = [
    bar(),
    hdr("ARMOR CATALOG"),
    bar(),
  ];
  for (const armor of ARMOR_CATALOG) {
    const slot = armor.locations.includes("head") ? acc("[HEAD]") : lbl("[MEAT]");
    const name = val(armor.name.replace(/_/g, " "));
    lines.push(
      row(armor.name.replace(/_/g, " "),
        `SP ${acc(String(armor.sp))}  pen ${dim(String(armor.penalty))}  ${slot}  ${dim(armor.priceCategory)}`)
    );
  }
  lines.push(bar());
  u.send(lines.join("\r\n"));
}

async function wearArmor(u: IUrsamuSDK, cpr: ICPRCharacter, armorName: string): Promise<void> {
  if (!armorName) {
    u.send(`${ERR}Specify armor: ${val("+armor/wear <name>")}`);
    return;
  }
  const name = armorName.toLowerCase().replace(/ /g, "_");
  const def  = getArmor(name);
  if (!def) {
    u.send(`${ERR}Unknown armor ${acc(`"${armorName}"`)}.  Type ${val("+armor/list")} to browse.`);
    return;
  }

  const penalty    = def.penalty;
  const slot       = def.locations.includes("head") ? "armorHead" : "armorBody";
  const slotLabel  = def.locations.includes("head") ? "head" : "meat";
  const armorState: IArmorState = {
    name:      def.name.replace(/_/g, " "),
    sp:        def.sp,
    currentSp: def.sp,
    penalty,
  };

  await u.db.modify(u.me.id, "$set", { [`state.cpr.${slot}`]: armorState });
  u.send(`${OK}${val(armorState.name)} strapped on ${dim("(")}${acc(slotLabel)}${dim(")")}  SP ${acc(String(def.sp))}  pen ${dim(String(penalty))}`);
}

async function removeArmor(u: IUrsamuSDK, cpr: ICPRCharacter, slot: string): Promise<void> {
  const normalized = slot.toLowerCase();
  if (normalized !== "body" && normalized !== "head") {
    u.send(`${ERR}Specify ${val("body")} or ${val("head")}.`);
    return;
  }
  const field   = normalized === "body" ? "armorBody" : "armorHead";
  const current = normalized === "body" ? cpr.armorBody : cpr.armorHead;
  if (!current) {
    u.send(`${ERR}No ${acc(normalized)} armor equipped.`);
    return;
  }
  await u.db.modify(u.me.id, "$set", { [`state.cpr.${field}`]: null });
  u.send(`${OK}${val(current.name)} stripped from ${dim(normalized)} slot.  ${dim("Running naked now.")}`);
}

async function repairArmor(u: IUrsamuSDK, cpr: ICPRCharacter, slot: string): Promise<void> {
  const normalized = slot.toLowerCase();
  if (normalized !== "body" && normalized !== "head") {
    u.send(`${ERR}Specify ${val("body")} or ${val("head")}.`);
    return;
  }
  const field   = normalized === "body" ? "armorBody" : "armorHead";
  const current = normalized === "body" ? cpr.armorBody : cpr.armorHead;
  if (!current) {
    u.send(`${ERR}No ${acc(normalized)} armor to repair.`);
    return;
  }
  if (current.currentSp >= current.sp) {
    u.send(`${ARR}${val(current.name)} is already at full SP.  Nothing to patch.`);
    return;
  }

  // Repair cost: 100eb per SP restored, requires basic_tech roll DV13
  const spLost     = current.sp - current.currentSp;
  const repairCost = spLost * 100;

  if (cpr.eurodollars < repairCost) {
    u.send(`${ERR}Repair costs ${val(`${repairCost}`)} ${dim("eb")}.  You have ${val(String(cpr.eurodollars))} ${dim("eb")}.  Not enough chrome cash.`);
    return;
  }

  const techSkill = cpr.skills["basic_tech"] ?? 0;
  const roll      = Math.floor(Math.random() * 10) + 1;
  const total     = cpr.stats.tech + techSkill + roll;
  const success   = total >= 13;

  if (!success) {
    const wasted = Math.floor(repairCost / 2);
    await u.db.modify(u.me.id, "$inc", { "state.cpr.eurodollars": -wasted });
    u.send([
      `${ERR}Repair failed ${dim(`(rolled ${total} vs DV13)`)} -- materials wasted.`,
      row("EDDIES BURNED", `${val(String(wasted))} ${dim("eb")}`),
    ].join("\r\n"));
    return;
  }

  const repaired: IArmorState = { ...current, currentSp: current.sp };
  await u.db.modify(u.me.id, "$set", {
    [`state.cpr.${field}`]: repaired,
    "state.cpr.eurodollars": cpr.eurodollars - repairCost,
  });
  u.send([
    `${OK}${val(current.name)} patched to full ${dim(`(rolled ${total} vs DV13)`)}`,
    row("SP",           acc(String(current.sp))),
    row("EDDIES SPENT", `${val(String(repairCost))} ${dim("eb")}`),
  ].join("\r\n"));
}

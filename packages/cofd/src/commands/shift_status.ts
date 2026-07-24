// Status / list / info branches for +shift.

import { divider, type IUrsamuSDK, type IDBObj } from "@ursamu/ursamu";
import {
  ANIMAL_FORMS,
  findAnimal,
  hasChrysalis,
  isChangelingSheet,
  maskStatusLine,
  unlockedAnimals,
} from "../form/index.ts";
import {
  changelingFormNames,
  getSheet,
} from "./shift_helpers.ts";

export async function shiftStatus(
  u: IUrsamuSDK,
  actor: IDBObj,
): Promise<void> {
  const sheet = getSheet(actor);
  if (!sheet) {
    u.send("No approved character sheet.");
    return;
  }

  const lines: string[] = [];
  lines.push(await divider("S H I F T"));
  if (actor.id !== u.me.id) {
    lines.push(`  Target: ${u.util.displayName(actor, u.me)}`);
  }

  if (isChangelingSheet(sheet)) {
    lines.push(`  ${maskStatusLine(sheet)}`);
    const mask = sheet.customFields?.mask?.trim();
    const mien = sheet.customFields?.mien?.trim();
    if (mask) lines.push(`  Mask: ${mask}`);
    if (mien) lines.push(`  Mien: ${mien}`);
    if (hasChrysalis(sheet)) {
      const un = unlockedAnimals(sheet);
      lines.push(
        un.length
          ? `  Chrysalis: ${un.join(", ")}`
          : "  Chrysalis: +sheet/set animals=wolf,hawk",
      );
    }
    lines.push(
      "  +shift mask|mien | +shift <animal> | +shift human",
    );
    lines.push("  Cost: Mask 1 Glamour; animal 2 Glamour.");
  } else if (sheet.template?.toLowerCase() === "werewolf") {
    lines.push("  Werewolf forms are not online yet.");
  } else {
    lines.push("  You have no forms to shift into.");
  }

  u.send(lines.join("\n"));
}

export async function shiftList(
  u: IUrsamuSDK,
  actor: IDBObj,
  filter: string,
): Promise<void> {
  const sheet = getSheet(actor);
  if (!sheet) {
    u.send("No approved character sheet.");
    return;
  }

  const f = filter.toLowerCase().trim();
  if (f === "animals" || f === "animal") {
    const lines = ANIMAL_FORMS.map(
      (a) =>
        `  ${a.slug.padEnd(10)} Size ${a.size}  ` +
        `Str ${a.strength} Dex ${a.dexterity} Sta ${a.stamina}`,
    );
    u.send(
      [
        await divider("A N I M A L S"),
        "  Catalog (Chrysalis).",
        ...lines,
      ].join("\n"),
    );
    return;
  }

  if (isChangelingSheet(sheet)) {
    u.send(`Forms: ${changelingFormNames(sheet).join(", ")}`);
    if (hasChrysalis(sheet)) u.send("Catalog: +shift/list animals");
    return;
  }
  if (sheet.template?.toLowerCase() === "werewolf") {
    u.send("Werewolf forms not online yet.");
    return;
  }
  u.send("No forms available for your template.");
}

export async function shiftInfo(
  u: IUrsamuSDK,
  name: string,
): Promise<void> {
  const key = name.toLowerCase().trim();
  if (!key) {
    u.send("Usage: +shift/info <form>");
    return;
  }

  if (key === "mask") {
    u.send(
      [
        await divider("MASK"),
        "  Mortal guise. Cost to raise: 1 Glamour.",
        "  Free on +combat/end. +sheet/set mask=<text>",
      ].join("\n"),
    );
    return;
  }
  if (key === "mien") {
    u.send(
      [
        await divider("MIEN"),
        "  Mask down. Cost: 1 Glamour.",
        "  Contract successes count as exceptional.",
        "  +sheet/set mien=<text>",
      ].join("\n"),
    );
    return;
  }
  if (key === "human") {
    u.send(
      [
        await divider("HUMAN"),
        "  Leave animal form (free). Restores prior Mask.",
      ].join("\n"),
    );
    return;
  }

  const animal = findAnimal(key);
  if (animal) {
    u.send(
      [
        await divider(animal.name.toUpperCase()),
        `  Size ${animal.size}  Str ${animal.strength}  ` +
          `Dex ${animal.dexterity}  Sta ${animal.stamina}`,
        `  ${animal.book}  Cost: 2 Glamour (Chrysalis).`,
      ].join("\n"),
    );
    return;
  }
  u.send(`Unknown form '${name}'. Try +shift/list.`);
}

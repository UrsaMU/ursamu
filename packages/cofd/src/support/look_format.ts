// Custom look layout format handler (CONFORMAT) for Chronicles of Darkness 2e.
// Implements a numbered inventory-style list for items, supports concealment gates,
// displays equipped weapons/armor (wielded/worn) even when flagged dark,
// and ensures NPCs show up correctly formatted in the Players section.

import type { IUrsamuSDK, IDBObj } from "@ursamu/ursamu";
import { getConfig } from "@ursamu/core";
import { itemData, displayName } from "../equipment/objects.ts";
import { lookupItem } from "../equipment/catalog.ts";
import { divider } from "./format.ts";

const SHORTDESC_PROMPT = "%ch%cxUse '&short-desc me=<desc>' to set.%cn";

const ROLE_TAGS = [
  { flag: "wizard",    display: "(Wizard)" },
  { flag: "superuser", display: "(Root)"   },
  { flag: "admin",     display: "(Admin)"  },
  { flag: "staff",     display: "(Staff)"  },
];

const visualLen = (s: string): number =>
  s.replace(/<#[0-9a-fA-F]{6}>/g, "").replace(/%c[a-zA-Z]/g, "").replace(/%[nrtbR]/g, "").length;

function coloredName(obj: IDBObj): string {
  const moniker = (obj.state?.moniker as string) || "";
  if (moniker) return moniker;

  const rawName = (obj.state?.name as string) || obj.name || "Unknown";
  const nameColor = (obj.state?.name_color as string) || "";
  if (nameColor && rawName.length > 0) {
    return `${nameColor}${rawName[0]}%cn%ch%cw${rawName.slice(1)}%cn`;
  }
  return rawName;
}

function formatIdle(lastCommand: number | undefined): string {
  if (lastCommand === undefined || isNaN(lastCommand)) return "%ch%cx0s%cn";
  const diff = Math.floor((Date.now() - lastCommand) / 1000);
  if (diff <= 0) return "%ch%cx0s%cn";
  if (diff < 60) return `%cg${diff}s%cn`;
  if (diff < 600) return `%cg${Math.floor(diff / 60)}m%cn`;
  if (diff < 3600) return `%cy${Math.floor(diff / 60)}m%cn`;
  if (diff < 86400) return `%cy${Math.floor(diff / 3600)}h%cn`;
  return `%ch%cx${Math.floor(diff / 86400)}d%cn`;
}

function getShortDesc(obj: IDBObj): string {
  const attrs = (obj.state?.attributes as { name?: string; value?: string }[]) || [];
  const sd = attrs.find(
    (a) =>
      a.name?.toLowerCase() === "short-desc" ||
      a.name?.toLowerCase() === "shortdesc",
  );
  return sd?.value || "";
}

function roleTag(obj: IDBObj): string {
  const configured = getConfig<Array<{ flag: string; display: string }>>("plugins.globals.theme.look.roleTags") || ROLE_TAGS;
  for (const t of configured) if (obj.flags?.has(t.flag)) return t.display;
  return "";
}

function structuralTag(d: ReturnType<typeof itemData>): string {
  if (!d) return "";
  if (d.broken) return " %cr[broken]%cn";
  const cur = d.structure;
  const max = d.maxStructure;
  if (typeof cur === "number" && typeof max === "number" && cur < max) {
    return ` [hp ${cur}/${max}]`;
  }
  return "";
}

/**
 * Custom CONFORMAT handler.
 * Differentiates Players/NPCs from inanimate things, formats things with
 * a numbered inventory (+eq/show) layout, respects concealment, and exposes
 * equipped (wielded/worn) items correctly even if they are dark.
 */
export const cofdConformatHandler = async (
  u: IUrsamuSDK,
  target: IDBObj,
  idList: string,
): Promise<string | null> => {
  const ids = idList.split(" ").map((id) => id.replace("#", "").trim()).filter(Boolean);
  const contents = target.contents || [];
  const visibleObjs = ids.map((id) => contents.find((c) => c.id === id)).filter((o): o is IDBObj => o != null);

  const looker = u.me;

  // Classify occupants:
  // - Players and NPCs: Objects with player+connected flags OR npc flag.
  const playersAndNpcs = visibleObjs.filter(
    (o) => (o.flags.has("player") && o.flags.has("connected")) || o.flags.has("npc")
  );

  // - Items/Things: Non-player, non-npc, non-exit, non-room objects.
  const rawItems = visibleObjs.filter(
    (o) => !o.flags.has("player") && !o.flags.has("npc") && !o.flags.has("exit") && !o.flags.has("room")
  );

  const lines: string[] = [];

  // 1. Players Section (preserve original column spacing and layout)
  if (playersAndNpcs.length > 0) {
    lines.push(divider("Players", "-", 78));
    for (const c of playersAndNpcs) {
      const isNpc = c.flags.has("npc");
      const cName = coloredName(c);
      // NPCs always show "(NPC)" in the role column and a blank idle column.
      const role = isNpc ? "(NPC)" : roleTag(c);
      const idle = isNpc ? "" : formatIdle(c.state?.lastCommand as number);
      const desc = getShortDesc(c) || SHORTDESC_PROMPT;
      const canEditChar = await u.canEdit(looker, c);
      const nameWithRef = canEditChar ? `${cName}(#${c.id})` : cName;

      const namePad = " ".repeat(Math.max(1, 21 - visualLen(nameWithRef)));
      const rolePad = " ".repeat(Math.max(1, 13 - visualLen(role)));
      const idlePad = " ".repeat(Math.max(1, 4 - visualLen(idle)));

      lines.push(` ${nameWithRef}${namePad}${role}${rolePad}${idle}${idlePad}${desc}`.replace(/\s+$/, ""));
    }
  }

  // 2. Items/Contents Section (+eq/show layout)
  const sheet = target.state?.cofd as { equipment?: { equippedWeapon?: string | null; equippedArmor?: string | null } } | undefined;
  const eqState = sheet?.equipment ?? { equippedWeapon: null, equippedArmor: null };

  const finalItems: string[] = [];
  let slot = 0;

  for (const obj of rawItems) {
    const d = itemData(obj);

    // Worn / wielded state checks:
    const isWielded = obj.state?.wielded === true ||
      obj.state?.wielded === "yes" ||
      eqState.equippedWeapon === obj.id ||
      (d?.kind === "weapon" && d?.equippedBy === target.id);

    const isWorn = obj.state?.worn === true ||
      obj.state?.worn === "yes" ||
      eqState.equippedArmor === obj.id ||
      (d?.kind === "armor" && d?.equippedBy === target.id);

    const isEquipped = isWielded || isWorn;

    // Concealment logic:
    let isConcealed = false;
    if (obj.state?.concealed === true || obj.state?.concealed === "yes") {
      isConcealed = true;
    } else if (d?.key) {
      const resolved = lookupItem(d.key);
      if (resolved && (resolved.entry as { concealed?: boolean }).concealed === true) {
        isConcealed = true;
      }
    }

    // Unequipped inventory rule: if looking at a player/NPC, any item they carry that is not equipped is concealed.
    const isCharacterContainer = target.flags.has("player") || target.flags.has("npc");
    if (isCharacterContainer && !isEquipped) {
      isConcealed = true;
    }

    // Equipped weapons and armor are never concealed.
    if (isEquipped) {
      isConcealed = false;
    }

    if (isConcealed) {
      const hasConcealedPermission = (looker.id === target.id) || (await u.canEdit(looker, target));
      if (!hasConcealedPermission) {
        continue; // Hide completely from looker
      }
    }

    // Item is visible; format row:
    slot += 1;
    const canEditObj = await u.canEdit(looker, obj);
    let label = displayName(obj);
    if (canEditObj) {
      label = `${label}(#${obj.id})`;
    }
    if (d?.kind === "ammo") {
      const count = d.count ?? 1;
      label = `${label} x${count}`;
    }

    const ammoClip = d && typeof d.currentClip === "number" ? ` [ammo ${d.currentClip}]` : "";

    let tag = "";
    if (isWielded) tag = " (wielded)";
    else if (isWorn) tag = " (worn)";

    const struct = structuralTag(d);
    const concealedTag = isConcealed ? " [concealed]" : "";
    const note = d?.note ? ` -- ${d.note}` : "";

    finalItems.push(
      `  ${String(slot).padStart(2)}. ${label}${ammoClip}${tag}${struct}${concealedTag}${note}`.trimEnd()
    );
  }

  if (finalItems.length > 0) {
    lines.push(divider("Contents", "-", 78));
    lines.push(...finalItems);
  }

  return lines.join("\n");
};

function wordWrap(text: string, width: number): string {
  const out: string[] = [];
  for (const paragraph of text.split("\n")) {
    if (paragraph.trim() === "") { out.push(""); continue; }
    let i = 0;
    while (i < paragraph.length && (paragraph[i] === " " || paragraph[i] === "\t")) i++;
    const indent = paragraph.slice(0, i);
    const indentW = visualLen(indent);
    if (visualLen(paragraph) <= width) { out.push(paragraph); continue; }
    const words = paragraph.slice(i).split(" ");
    let line = indent + words[0];
    let lineLen = indentW + visualLen(words[0]);
    for (let w = 1; w < words.length; w++) {
      const wl = visualLen(words[w]);
      if (lineLen + 1 + wl > width) { out.push(line); line = words[w]; lineLen = wl; }
      else { line += " " + words[w]; lineLen += 1 + wl; }
    }
    if (line.length > 0) out.push(line);
  }
  return out.join("\n");
}

/**
 * Custom DESCFORMAT handler.
 * Ensures the description has a %r (newline) after it.
 */
export const cofdDescformatHandler = (
  _u: IUrsamuSDK,
  _target: IDBObj,
  desc: string,
): Promise<string | null> => {
  if (!desc) return Promise.resolve(null);
  const wrapped = wordWrap(desc, 77); // WIDTH (78) - 1
  const indented = wrapped
    .split("\n")
    .map((line) => (line.trim() ? " " + line : ""))
    .join("\n");
  return Promise.resolve(`${indented}%r`);
};


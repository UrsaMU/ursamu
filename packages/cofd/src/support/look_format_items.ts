// Item row formatting for CoFD CONFORMAT.

import type { IDBObj, IUrsamuSDK } from "@ursamu/ursamu";
import { dbrefWithFlags } from "@ursamu/mush";
import { itemData } from "../equipment/objects.ts";
import { lookupItem } from "../equipment/catalog.ts";
import { resolveItemLookName } from "./perception.ts";

const visualLen = (s: string): number =>
  s.replace(/<#[0-9a-fA-F]{6}>/g, "")
    .replace(/%c[a-zA-Z]/g, "")
    .replace(/%[nrtbR]/g, "").length;

function structuralTag(
  d: ReturnType<typeof itemData>,
): string {
  if (!d) return "";
  if (d.broken) return " %cr[broken]%cn";
  const cur = d.structure;
  const max = d.maxStructure;
  if (
    typeof cur === "number" &&
    typeof max === "number" &&
    cur < max
  ) {
    return ` [hp ${cur}/${max}]`;
  }
  return "";
}

function getShortDesc(obj: IDBObj): string {
  const attrs =
    (obj.state?.attributes as {
      name?: string;
      value?: string;
    }[]) || [];
  const sd = attrs.find(
    (a) =>
      a.name?.toLowerCase() === "short-desc" ||
      a.name?.toLowerCase() === "shortdesc",
  );
  return sd?.value || "";
}

export async function formatContentItems(
  u: IUrsamuSDK,
  looker: IDBObj,
  target: IDBObj,
  rawItems: IDBObj[],
): Promise<string[]> {
  const sheet = target.state?.cofd as {
    equipment?: {
      equippedWeapon?: string | null;
      equippedArmor?: string | null;
    };
  } | undefined;
  const eqState = sheet?.equipment ?? {
    equippedWeapon: null,
    equippedArmor: null,
  };
  const isChar =
    target.flags.has("player") || target.flags.has("npc");

  const finalItems: string[] = [];
  let slot = 0;

  for (const obj of rawItems) {
    const d = itemData(obj);
    const isWielded = isChar && (
      eqState.equippedWeapon === obj.id ||
      (d?.kind === "weapon" && d?.equippedBy === target.id)
    );
    const isWorn = isChar && (
      eqState.equippedArmor === obj.id ||
      (d?.kind === "armor" && d?.equippedBy === target.id)
    );
    const isEquipped = isWielded || isWorn;

    let isConcealed = false;
    if (
      obj.state?.concealed === true ||
      obj.state?.concealed === "yes"
    ) {
      isConcealed = true;
    } else if (d?.key) {
      const resolved = lookupItem(d.key);
      if (
        resolved &&
        (resolved.entry as { concealed?: boolean })
          .concealed === true
      ) {
        isConcealed = true;
      }
    }
    if (!isEquipped && obj.flags?.has("dark")) {
      isConcealed = true;
    }
    if (isEquipped) isConcealed = false;

    if (isConcealed) {
      const ok = looker.id === target.id ||
        (await u.canEdit(looker, target));
      if (!ok) continue;
    }

    slot += 1;
    const canEditObj = await u.canEdit(looker, obj);
    let label = resolveItemLookName(looker, obj);
    if (
      canEditObj ||
      looker.flags.has("wizard") ||
      looker.flags.has("admin") ||
      looker.flags.has("superuser") ||
      looker.flags.has("staff") ||
      looker.flags.has("builder")
    ) {
      label =
        `${label}(${dbrefWithFlags(obj.id, obj.flags)})`;
    }
    if (d?.kind === "ammo" || d?.kind === "goblin-fruit") {
      const count = d.count ?? 1;
      if (count > 1 || d.kind === "ammo") {
        label = `${label} x${count}`;
      }
    }

    const ammoClip = d && typeof d.currentClip === "number"
      ? ` [ammo ${d.currentClip}]`
      : "";
    let tag = "";
    if (isWielded) tag = " (wielded)";
    else if (isWorn) tag = " (worn)";

    const base = (
      `  ${String(slot).padStart(2)}. ${label}` +
      `${ammoClip}${tag}${structuralTag(d)}` +
      `${isConcealed ? " [concealed]" : ""}` +
      `${d?.note ? ` -- ${d.note}` : ""}`
    ).trimEnd();

    if (!isChar) {
      const sd = getShortDesc(obj);
      if (sd) {
        const pad = " ".repeat(
          Math.max(1, 40 - visualLen(base)),
        );
        finalItems.push(`${base}${pad}${sd}`.trimEnd());
        continue;
      }
    }
    finalItems.push(base);
  }
  return finalItems;
}

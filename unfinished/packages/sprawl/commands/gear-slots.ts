/**
 * wear / wield / stow — equip slots (also +gear/wear…).
 * Top-level verbs so players find them without hunting +gear.
 */
import { addCmd } from "@ursamu/mush";
import type { IUrsamuSDK } from "@ursamu/mush";
import {
  ARR,
  ERR,
  OK,
  dim,
  divider,
  panelClose,
  panelOpen,
  val,
  ylw,
} from "./chrome.ts";
import {
  getChar,
  getInventory,
} from "../engine/sheet-io.ts";
import {
  displayName,
  itemData,
  personalGearItems,
  resolveItemRef,
  setItemSlot,
} from "../engine/items.ts";
import { refreshGearLook } from "../engine/desc.ts";
import { isPersonalGear } from "../engine/vehicles.ts";

/** Reassemble state.description from base + current gear. */
export async function maybeRefreshLook(
  u: IUrsamuSDK,
): Promise<void> {
  if (!getChar(u.me)) return;
  const { items } = await getInventory(u, u.me);
  await refreshGearLook(u, items);
}

function suggestFor(kind: string): "wear" | "wield" | "use" {
  const k = kind.toLowerCase();
  if (k === "armor" || k === "drone") return "wear";
  if (
    k === "firearm" || k === "melee" || k === "heavy" ||
    k === "weapon"
  ) {
    return "wield";
  }
  return "use";
}

/** Guide panel when wear/wield/stow has no target. */
export async function renderEquipHelp(
  u: IUrsamuSDK,
  verb: "wear" | "wield" | "stow",
): Promise<string[]> {
  const lines = [
    panelOpen("EQUIP", verb.toUpperCase()),
    `  ${dim("Put gear on your body or in hand.")}`,
    divider("COMMANDS"),
    `  ${val("wear <item|#n>")}   armor / clothes → worn`,
    `  ${val("wield <item|#n>")}  gun / blade → wielded`,
    `  ${val("stow <item|#n>")}   back to carried pack`,
    `  ${dim("Same as")} ${val("+gear/wear")} ` +
    `${val("+gear/wield")} ${val("+gear/stow")}`,
  ];
  const c = getChar(u.me);
  if (!c) {
    lines.push(
      `  ${ARR}No sheet — ${val("+chargen")} first.`,
    );
    lines.push(panelClose("SPRAWL"));
    return lines;
  }
  const { items } = await getInventory(u, u.me);
  const gear = personalGearItems(items).filter((o) =>
    isPersonalGear(itemData(o))
  );
  lines.push(divider("YOUR PACK"));
  if (!gear.length) {
    lines.push(`  ${dim("empty — +market/buy something")}`);
  } else {
    let n = 0;
    for (const o of gear) {
      n++;
      const d = itemData(o);
      const slot = d?.slot && d.slot !== "carried"
        ? ylw(d.slot)
        : dim("carried");
      const tip = suggestFor(String(d?.kind ?? "gear"));
      const cmd = tip === "use"
        ? `use #${n}`
        : `${tip} #${n}`;
      lines.push(
        `  ${dim("#" + n)} ${displayName(o)}  ` +
          `[${slot}]  ${dim("→ " + cmd)}`,
      );
    }
  }
  lines.push(
    `  ${ylw("Try:")} ${val(verb + " #1")}` +
      `  ${dim("or")} ${val("inv")}`,
  );
  lines.push(
    `  ${dim("Help:")} ${val("+help wear")}  ` +
      `${val("+help gear")}`,
  );
  lines.push(panelClose("SPRAWL"));
  return lines;
}

export async function setSlotSwitch(
  u: IUrsamuSDK,
  sw: "wear" | "wield" | "stow",
  arg: string,
): Promise<void> {
  if (!arg) {
    u.send((await renderEquipHelp(u, sw)).join("\r\n"));
    return;
  }
  if (!getChar(u.me)) {
    u.send(`${ARR}No sheet. ${val("+chargen")} first.`);
    return;
  }
  const item = await resolveItemRef(u, u.me.id, arg);
  if (!item) {
    u.send(
      `${ERR}Not in pack. ${val("inv")} then ` +
        `${val(sw + " #1")}.`,
    );
    return;
  }
  const d0 = itemData(item);
  if (!d0) {
    u.send(`${ERR}Not a Sprawl item.`);
    return;
  }
  // Soft guidance: armor → wear, weapons → wield
  if (sw === "wear" && suggestFor(d0.kind) === "wield") {
    u.send(
      `${ARR}${val(displayName(item))} is a weapon — ` +
        `${dim("use")} ${val("wield " + arg)} ` +
        `${dim("(wearing anyway)")}`,
    );
  }
  if (sw === "wield" && suggestFor(d0.kind) === "wear") {
    u.send(
      `${ARR}${val(displayName(item))} looks like armor — ` +
        `${dim("use")} ${val("wear " + arg)} ` +
        `${dim("(wielding anyway)")}`,
    );
  }
  const slot = sw === "stow"
    ? "carried"
    : sw === "wear"
    ? "worn"
    : "wielded";
  const d = await setItemSlot(u, item, slot);
  if (!d) {
    u.send(`${ERR}Not a Sprawl item.`);
    return;
  }
  const next = slot === "carried"
    ? `${OK}${val(displayName(item))} stowed (carried).`
    : slot === "worn"
    ? `${OK}Wearing ${val(displayName(item))}.` +
      ` ${dim("Armor bonus active · +desc")}`
    : `${OK}Wielding ${val(displayName(item))}.` +
      ` ${dim("Ready to +attack · +desc")}`;
  u.send(next);
  await maybeRefreshLook(u);
}

export async function afterGearChange(
  u: IUrsamuSDK,
): Promise<void> {
  await maybeRefreshLook(u);
}

function addEquipVerb(
  name: string,
  pattern: RegExp,
  sw: "wear" | "wield" | "stow",
): void {
  addCmd({
    name,
    pattern,
    lock: "connected",
    category: "Sprawl Goons",
    help: `${name} <item|#n>  — ${
      sw === "stow"
        ? "Return gear to carried pack."
        : sw === "wear"
        ? "Wear armor/clothes (look + armor bonus)."
        : "Wield a weapon (look + attacks)."
    }

Syntax:
  ${sw} <name|#n>
  +gear/${sw} <name|#n>

Examples:
  inv
  ${sw} #1
  ${sw} leathers
  stow #1

See also: +help wear, +help gear, +desc`,

    exec: async (u: IUrsamuSDK) => {
      const arg = u.util.stripSubs(u.cmd.args[0] ?? "").trim();
      await setSlotSwitch(u, sw, arg);
    },
  });
}

// Word-boundary end anchors — "wearing…" must not steal IC speech,
// and bare "wield" must not fall through to default-say on web.
addEquipVerb("wear", /^wear(?:\s+(.*))?$/i, "wear");
addEquipVerb("+wear", /^\+wear(?:\s+(.*))?$/i, "wear");
addEquipVerb("wield", /^wield(?:\s+(.*))?$/i, "wield");
addEquipVerb("+wield", /^\+wield(?:\s+(.*))?$/i, "wield");
addEquipVerb("stow", /^stow(?:\s+(.*))?$/i, "stow");
addEquipVerb("+stow", /^\+stow(?:\s+(.*))?$/i, "stow");

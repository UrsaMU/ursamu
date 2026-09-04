/**
 * Block drop/give of equipped D&D gear.
 * Wraps core cmds in init; restores originals in remove.
 */
import { cmds, type IUrsamuSDK } from "@ursamu/mush";

type CmdExec = (u: IUrsamuSDK) => void | Promise<void>;
type CmdRef = { name: string; exec: CmdExec };

let dropOrig: CmdExec | null = null;
let giveOrig: CmdExec | null = null;
let dropRef: CmdRef | null = null;
let giveRef: CmdRef | null = null;
let installed = false;

function isEquipped(
  // deno-lint-ignore no-explicit-any
  thing: any,
): boolean {
  if (!thing) return false;
  const dnd = thing.state?.dnd ?? thing.data?.dnd;
  return !!dnd?.equipped;
}

async function dropGuard(u: IUrsamuSDK): Promise<void> {
  const arg = u.util.stripSubs(u.cmd.args[0] || "").trim();
  const thing = await u.util.target(u.me, arg);
  if (isEquipped(thing)) {
    u.send(
      "You cannot drop equipped items. Unequip them first.",
    );
    return;
  }
  if (dropOrig) await dropOrig(u);
}

async function giveGuard(u: IUrsamuSDK): Promise<void> {
  const itemArg = (u.cmd.args[0] ?? "").trim();
  // Numeric first arg is qty form — skip name resolve.
  if (!/^\d+$/.test(itemArg)) {
    const thing = await u.util.target(u.me, itemArg);
    if (isEquipped(thing)) {
      u.send(
        "You cannot give equipped items. Unequip them first.",
      );
      return;
    }
  }
  if (giveOrig) await giveOrig(u);
}

/** Install once; safe if drop/give not registered yet. */
export function initEquippedGuards(): void {
  if (installed) return;

  const dropCmd = cmds.find((c) => c.name === "drop") as
    | CmdRef
    | undefined;
  if (dropCmd && dropCmd.exec !== dropGuard) {
    dropOrig = dropCmd.exec;
    dropRef = dropCmd;
    dropCmd.exec = dropGuard;
  }

  const giveCmd = cmds.find((c) => c.name === "give") as
    | CmdRef
    | undefined;
  if (giveCmd && giveCmd.exec !== giveGuard) {
    giveOrig = giveCmd.exec;
    giveRef = giveCmd;
    giveCmd.exec = giveGuard;
  }

  installed = !!(dropRef || giveRef);
}

/** Restore core drop/give execs. */
export function removeEquippedGuards(): void {
  if (dropRef && dropOrig) {
    dropRef.exec = dropOrig;
  }
  if (giveRef && giveOrig) {
    giveRef.exec = giveOrig;
  }
  dropOrig = null;
  giveOrig = null;
  dropRef = null;
  giveRef = null;
  installed = false;
}

/** Test helper — whether guards are currently wrapped. */
export function equippedGuardsInstalled(): boolean {
  return installed;
}

import { IUrsamuSDK } from "../../src/@types/UrsamuSDK.ts";

export const aliases = ["@force"];

/**
 * System Script: forceCmd.ts
 * Admin-only: execute a command as another object/player.
 * Usage: @force <target>=<command>
 */
export default async (u: IUrsamuSDK) => {
  const actor = u.me;

  if (!actor.flags.has("admin") && !actor.flags.has("wizard") && !actor.flags.has("superuser")) {
    u.send("Permission denied.");
    return;
  }

  const input = (u.cmd.args[0] || "").trim();
  const eqIdx = input.indexOf("=");
  if (eqIdx === -1) {
    u.send("Usage: @force <target>=<command>");
    return;
  }

  const targetName = input.slice(0, eqIdx).trim();
  const command = input.slice(eqIdx + 1).trim();

  if (!targetName || !command) {
    u.send("Usage: @force <target>=<command>");
    return;
  }

  const target = await u.util.target(actor, targetName);
  if (!target) {
    u.send("I can't find that.");
    return;
  }

  // Cannot force a superuser unless the actor is also superuser
  if (target.flags.has("superuser") && !actor.flags.has("superuser")) {
    u.send("You cannot force a superuser.");
    return;
  }

  await u.forceAs(target.id, command);

  u.send(`You force ${target.name || target.id} to: ${command}`);
};

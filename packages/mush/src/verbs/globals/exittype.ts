/**
 * @exittype — set/clear TYPE attribute on an exit (look grouping).
 */
import { addCmd } from "../../commands/addCmd.ts";
import type { IUrsamuSDK } from "../../commands/types.ts";

export async function execExitType(u: IUrsamuSDK): Promise<void> {
  const ref = u.util.stripSubs(u.cmd.args[0] ?? "").trim();
  const value = u.util.stripSubs(u.cmd.args[1] ?? "").trim();

  if (!ref) {
    u.send("Usage: @exittype <exit>=[<value>]");
    return;
  }

  const target = await u.util.target(u.me, ref, true);
  if (!target) {
    u.send(`No exit found matching '${ref}'.`);
    return;
  }
  if (!target.flags.has("exit")) {
    u.send(
      `${u.util.displayName(target, u.me)} is not an exit.`,
    );
    return;
  }
  if (!(await u.canEdit(u.me, target))) {
    u.send("Permission denied.");
    return;
  }

  const name = u.util.displayName(target, u.me);

  if (!value) {
    const removed = await u.attr.clear(target.id, "TYPE");
    if (!removed) {
      u.send(`${name} had no TYPE set.`);
      return;
    }
    u.send(`Cleared TYPE on ${name}.`);
    return;
  }

  await u.attr.set(target.id, "TYPE", value);
  u.send(`Set TYPE on ${name} to ${value}.`);
}

addCmd({
  name: "@exittype",
  pattern: /^@exittype\s+(.+?)\s*=\s*(.*)$/i,
  lock: "connected builder+",
  category: "Building",
  help: `@exittype <exit>=[<value>]  — Set exit TYPE attribute.

Look groups exits by TYPE. Empty value clears TYPE.
Equivalent to: &type <exit>=<value>

Examples:
  @exittype north=direction
  @exittype Inn=tavern
  @exittype north=`,
  exec: execExitType,
});

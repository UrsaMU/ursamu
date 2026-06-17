import { addCmd } from "../commands/addCmd.ts";
import type { IUrsamuSDK } from "../commands/types.ts";
import { REACTIVE_ATTRS } from "./world.ts";

export async function execSweep(u: IUrsamuSDK): Promise<void> {
  const actor   = u.me;
  const isAdmin = actor.flags.has("admin") || actor.flags.has("wizard") || actor.flags.has("superuser");
  if (!isAdmin) { u.send("Permission denied."); return; }

  const contents = await u.db.search({ location: u.here.id });
  const reactive: string[] = [];

  for (const obj of contents) {
    if (obj.id === actor.id) continue;
    const attrs = obj.state?.attributes as Array<{ name: string }> | undefined;
    if (!attrs || !Array.isArray(attrs)) continue;
    const found = REACTIVE_ATTRS.filter((rAttr) => attrs.some((a) => a.name === rAttr));
    if (found.length > 0) reactive.push(`  ${obj.name || obj.id} [${found.join(", ")}]`);
  }

  if (reactive.length === 0) { u.send("No reactive objects in this room."); return; }
  u.send("%chReactive objects in this room:%cn");
  for (const line of reactive) u.send(line);
}

addCmd({
  name: "@sweep",
  pattern: /^@sweep$/i,
  lock: "connected admin+",
  category: "Admin",
  help: `@sweep  — List reactive objects in the current room.

Shows all objects that have LISTEN, AHEAR, ACONNECT, ADISCONNECT, or
STARTUP attributes set.

Examples:
  @sweep`,
  exec: execSweep,
});

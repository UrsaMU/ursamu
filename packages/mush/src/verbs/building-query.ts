/**
 * World-query verbs: @entrances.
 */

import { addCmd } from "../commands/addCmd.ts";
import type { IUrsamuSDK } from "../commands/types.ts";

addCmd({
  name: "@entrances",
  pattern: /^@?entrances(?:\s+(.*))?$/i,
  lock: "connected admin+",
  category: "Building",
  help: `@entrances [<object>]  — List all exits leading to a location (admin+).

EXAMPLES
  @entrances
  @entrances Lobby`,
  exec: async (u: IUrsamuSDK) => {
    const isAdmin = u.me.flags.has("admin") || u.me.flags.has("wizard") || u.me.flags.has("superuser");
    if (!isAdmin) { u.send("Permission denied."); return; }
    const arg    = (u.cmd.args[0] ?? "").trim();
    const target = arg ? await u.util.target(u.me, arg) : u.here;
    if (!target) { u.send(`I can't find '${arg}'.`); return; }
    const exits   = await u.db.search({ flags: /exit/ });
    const matches: string[] = [];
    for (const exit of exits) {
      const dest = (exit.state?.destination as string | undefined) ??
        (exit.state?.location as string | undefined);
      if (dest !== target.id) continue;
      const exitLocation = exit.location ?? (exit.state?.location as string | undefined);
      let roomName = exitLocation ?? "(unknown room)";
      if (exitLocation) {
        const rooms = await u.db.search({ id: exitLocation } as never);
        if (rooms.length > 0) roomName = rooms[0].name || exitLocation;
      }
      matches.push(`  Exit '${exit.name || exit.id}' in ${roomName}`);
    }
    if (matches.length === 0) { u.send(`No exits lead to ${target.name}.`); return; }
    u.send(`%chEntrances to ${target.name}:%cn`);
    for (const line of matches) u.send(line);
  },
});

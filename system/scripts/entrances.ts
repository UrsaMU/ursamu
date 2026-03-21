import { IUrsamuSDK } from "../../src/@types/UrsamuSDK.ts";

export const aliases = ["@entrances"];

/**
 * System Script: entrances.ts
 * Lists all exits that link TO a given location (default: current room).
 * Usage: @entrances [<object>]
 */
export default async (u: IUrsamuSDK) => {
  const actor = u.me;
  const arg = (u.cmd.args[0] || "").trim();

  let target;
  if (arg) {
    target = await u.util.target(actor, arg);
    if (!target) {
      u.send(`I can't find '${arg}'.`);
      return;
    }
  } else {
    target = u.here;
  }

  const targetId = target.id;
  const targetName = target.name || targetId;

  // Search all exits
  const exits = await u.db.search({ flags: /exit/ });

  const matches: string[] = [];

  for (const exit of exits) {
    const dest = (exit.state?.destination as string) || (exit.state?.location as string);
    if (dest !== targetId) continue;

    // Find the room containing this exit
    const exitLocation = exit.location || (exit.state?.location as string);
    let roomName = exitLocation || "(unknown room)";
    if (exitLocation) {
      const rooms = await u.db.search({ id: exitLocation } as unknown as Record<string, unknown>);
      if (rooms.length > 0) {
        roomName = rooms[0].name || exitLocation;
      }
    }

    matches.push(`  Exit '${exit.name || exit.id}' in ${roomName}`);
  }

  if (matches.length === 0) {
    u.send(`No exits lead to ${targetName}.`);
    return;
  }

  u.send(`%chEntrances to ${targetName}:%cn`);
  for (const line of matches) {
    u.send(line);
  }
};

import { IUrsamuSDK } from "../../src/@types/UrsamuSDK.ts";

/**
 * System Script: connect.ts
 * Handles player authentication and session initialization.
 */
export default async (u: IUrsamuSDK) => {
  const pieces = u.cmd.args[0].split(" ");
  let name = "";
  let password = "";
  
  if (pieces.length === 2) {
    [name, password] = pieces;
  } else {
    password = pieces.pop() || "";
    name = pieces.join(" ");
  }

  name = name.trim();

  if (!name || !password) {
    u.send("You must provide both a name and password.");
    return;
  }

  // Verify credentials
  const match = await u.auth.verify(name, password);
  if (!match) {
    u.send("I can't find a character by that name!");
    return;
  }

  // Find the player object to get the ID
  // We search for name or alias
  const results = await u.db.search({ 
    $or: [
      { "data.name": new RegExp(`^${name}$`, "i") },
      { "data.alias": new RegExp(`^${name}$`, "i") }
    ]
  });

  const player = results[0];
  if (!player) {
    u.send("I can't find a character by that name!");
    return;
  }

  // Perform login
  await u.auth.login(player.id);

  // Welcome message
  u.send(`Welcome back, ${u.util.displayName(player, player)}.`);

  // Broadcast to room
  if (player.location) {
    u.broadcast(`${u.util.displayName(player, player)} has connected.`);
  }

  // Force a look command
  u.execute("look");
};

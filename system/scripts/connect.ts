import { IUrsamuSDK } from "../../src/@types/UrsamuSDK.ts";

/**
 * System Script: connect.ts
 * Handles player authentication and session initialization.
 */
export default async (u: IUrsamuSDK) => {
  const pieces = (u.cmd.args[0] || "").split(" ");
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

  // Failsafe: if no superusers exist, promote this player
  let superusers: typeof results = [];
  try {
    const all = await u.db.search({});
    superusers = all.filter((o) => o.flags && o.flags.has("superuser"));
  } catch (e) {
    console.warn("connect.ts: superuser search failed, skipping promotion check:", e);
  }
  if (!superusers.length && !player.flags.has("superuser")) {
    await u.setFlags(player.id, "superuser");
    u.send("%ch%cyYou are the first user — superuser access granted.%cn");
  }

  // Welcome message
  u.send(`Welcome back, ${u.util.displayName(player, player)}.`);

  // Connection history
  const lastLogin = player.state.lastLogin as number | undefined;
  const failedAttempts = player.state.failedAttempts as number | undefined;
  if (lastLogin) {
    u.send(`Last login: ${new Date(lastLogin).toLocaleString()}`);
  }
  if (failedAttempts && failedAttempts > 0) {
    u.send(`%ch%cr${failedAttempts} failed login attempt${failedAttempts === 1 ? "" : "s"} since your last visit.%cn`);
  }

  // Warn about abandoned draft
  if (player.state.tempMail) {
    u.send("%chMAIL:%cn You have an unsent draft. Use '@mail proof' to review or '@mail abort' to discard.");
  }

  // Record this login and clear failed attempts (targeted update to avoid overwriting other data fields)
  await u.db.modify(player.id, "$set", { "data.lastLogin": Date.now(), "data.failedAttempts": 0 });

  // Broadcast to room
  if (player.location) {
    u.broadcast(`${u.util.displayName(player, player)} has connected.`);
  }

  // Show MOTD if set
  const motd = await u.text.read("motd");
  if (motd) {
    u.send("%ch%cy--- Message of the Day ---%cn");
    u.send(motd);
    u.send("%ch%cy--------------------------%cn");
  }

  // Login notifications: unread mail and new bboard posts
  const mailItems = await u.mail.read({ to: player.id, read: false });
  if (mailItems.length > 0) {
    u.send(`%ch%cyYou have ${mailItems.length} unread mail message${mailItems.length === 1 ? "" : "s"}.%cn`);
  }

  const newBBPosts = await u.bb.totalNewCount();
  if (newBBPosts > 0) {
    u.send(`%ch%cyThere ${newBBPosts === 1 ? "is" : "are"} ${newBBPosts} new bulletin board post${newBBPosts === 1 ? "" : "s"}.%cn`);
  }

  // Force a look command
  u.execute("look");
};

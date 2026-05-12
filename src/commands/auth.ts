import { addCmd } from "../services/commands/cmdParser.ts";
import type { IUrsamuSDK } from "../@types/UrsamuSDK.ts";
import { sign } from "../services/jwt/jwt.ts";

export async function execConnect(u: IUrsamuSDK): Promise<void> {
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

  // Single lookup: verify returns the player object on success, false on failure
  const player = await u.auth.verify(name, password);
  if (!player) {
    u.send("I can't find a character by that name!");
    return;
  }

  await u.auth.login(player.id);

  // Issue a session token so telnet (or any client) can re-authenticate
  // after a server restart without forcing the player to log in again.
  try {
    const token = await sign({ id: player.id });
    u.send("", undefined, { token });
  } catch (e) {
    console.warn("[auth] Failed to issue session token:", e);
  }

  // Failsafe: promote first player to superuser if none exist.
  // Short-circuit if this player is already a superuser, then use a targeted query.
  try {
    if (!player.flags.has("superuser")) {
      const superusers = await u.db.search({ flags: /superuser/ });
      if (!superusers.length) {
        await u.setFlags(player.id, "superuser");
        u.send("%ch%cyYou are the first user — superuser access granted.%cn");
      }
    }
  } catch (e: unknown) {
    console.warn("auth: superuser check failed:", e);
  }

  u.send(`Welcome back, ${u.util.displayName(player, player)}.`);

  const lastLogin = player.state.lastLogin as number | undefined;
  const failedAttempts = player.state.failedAttempts as number | undefined;
  if (lastLogin) u.send(`Last login: ${new Date(lastLogin).toLocaleString()}`);
  if (failedAttempts && failedAttempts > 0) {
    u.send(`%ch%cr${failedAttempts} failed login attempt${failedAttempts === 1 ? "" : "s"} since your last visit.%cn`);
  }

  await u.db.modify(player.id, "$set", { "data.lastLogin": Date.now(), "data.failedAttempts": 0 });

  if (player.location) u.broadcast(`${u.util.displayName(player, player)} has connected.`);

  const motd = await u.text.read("motd");
  if (motd) {
    u.send("%ch%cy--- Message of the Day ---%cn");
    u.send(motd);
    u.send("%ch%cy--------------------------%cn");
  }

  u.execute("look");
}

export function execQuit(u: IUrsamuSDK): void {
  u.send("See You, Space Cowboy...", undefined, { quit: true });
}

export async function execMotd(u: IUrsamuSDK): Promise<void> {
  const sw = (u.cmd.args[0] || "").toLowerCase().trim();
  const text = (u.cmd.args[1] || "").trim();
  const isAdmin = u.me.flags.has("admin") || u.me.flags.has("wizard") || u.me.flags.has("superuser");

  if (sw === "set") {
    if (!isAdmin) { u.send("Permission denied."); return; }
    if (!text) { u.send("Usage: @motd/set <message of the day>"); return; }
    await u.text.set("motd", text);
    u.send("MOTD updated.");
    return;
  }

  if (sw === "clear") {
    if (!isAdmin) { u.send("Permission denied."); return; }
    await u.text.set("motd", "");
    u.send("MOTD cleared.");
    return;
  }

  const motd = await u.text.read("motd");
  if (!motd) { u.send("No message of the day has been set."); return; }
  u.send("%ch%cy--- Message of the Day ---%cn");
  u.send(motd);
  u.send("%ch%cy--------------------------%cn");
}

export async function execPassword(u: IUrsamuSDK): Promise<void> {
  const actor = u.me;
  const input = (u.cmd.args[0] || "").trim();
  const isStaff = actor.flags.has("superuser") || actor.flags.has("admin") || actor.flags.has("wizard");

  const eqIdx = input.indexOf("=");
  if (eqIdx === -1 || !input) {
    u.send(isStaff
      ? "Usage: @password <oldpass>=<newpass>  OR  @password <player>=<newpass>"
      : "Usage: @password <oldpass>=<newpass>");
    return;
  }

  const left = input.slice(0, eqIdx).trim();
  const newPass = input.slice(eqIdx + 1).trim();

  if (!newPass) { u.send("New password cannot be empty."); return; }
  if (newPass.length < 5) { u.send("Password must be at least 5 characters."); return; }

  if (isStaff) {
    const results = await u.db.search(left);
    const target = results.find((obj) => obj.flags.has("player"));
    if (target && target.id !== actor.id) {
      await u.auth.setPassword(target.id, newPass);
      u.send(`Password for ${target.name || target.id} has been changed.`);
      u.send("Your password has been changed by staff.", target.id);
      return;
    }
  }

  const match = await u.auth.verify(actor.state.name as string, left);
  if (!match) { u.send("Incorrect old password."); return; }
  await u.auth.setPassword(actor.id, newPass);
  u.send("Your password has been changed.");
}

export async function execUpdate(u: IUrsamuSDK): Promise<void> {
  const isAdmin = u.me.flags.has("admin") || u.me.flags.has("wizard") || u.me.flags.has("superuser");
  if (!isAdmin) { u.send("Permission denied."); return; }
  const branch = (u.cmd.args[0] || "").trim();
  u.here.broadcast(
    `%chGame>%cn @update initiated by %ch${u.me.name}%cn — pulling latest code...`
  );
  await u.sys.update(branch);
}

addCmd({
  name: "connect",
  pattern: /^connect\s+(.*)/i,
  lock: "",
  category: "Authentication",
  help: `connect <name> <password>  — Log in to the game.

Examples:
  connect Alice mypassword`,
  exec: execConnect,
});

addCmd({
  name: "quit",
  pattern: /^quit$/i,
  lock: "connected",
  category: "Authentication",
  help: `quit  — Disconnect from the game.

Examples:
  quit`,
  exec: execQuit,
});

addCmd({
  name: "@motd",
  pattern: /^@?motd(?:\/(set|clear))?\s*(.*)?/i,
  lock: "connected",
  category: "Authentication",
  help: `@motd             — Display the message of the day.
@motd/set <text>  — Set the MOTD (admin/wizard only).
@motd/clear       — Clear the MOTD (admin/wizard only).

Examples:
  @motd
  @motd/set Welcome to the game! Enjoy your stay.
  @motd/clear`,
  exec: execMotd,
});

addCmd({
  name: "@password",
  pattern: /^@?password\s+(.*)/i,
  lock: "connected",
  category: "Authentication",
  help: `@password <oldpass>=<newpass>   — Change your own password.
@password <player>=<newpass>   — Set a player's password (admin/wizard only).

Examples:
  @password oldpass=newpass
  @password Alice=resetpass`,
  exec: execPassword,
});

addCmd({
  name: "@update",
  pattern: /^@?(?:update|upgrade)(?:\s+(.*))?$/i,
  lock: "connected admin+",
  category: "System",
  help: `@update [<branch>]  — Pull latest code and reboot (admin+).

Aliases: @upgrade

Examples:
  @update
  @update main`,
  exec: execUpdate,
});

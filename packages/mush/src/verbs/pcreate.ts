import { addCmd } from "../commands/addCmd.ts";
import type { IUrsamuSDK } from "../commands/types.ts";
import { getConfig, log } from "@ursamu/core";

const isAdmin = (u: IUrsamuSDK): boolean =>
  u.me.flags.has("admin") ||
  u.me.flags.has("wizard") ||
  u.me.flags.has("superuser");

/** Staff create a player without logging in as them. */
export async function execPcreate(u: IUrsamuSDK): Promise<void> {
  if (!isAdmin(u)) {
    u.send("Permission denied.");
    return;
  }

  const raw = u.util.stripSubs(u.cmd.args[0] ?? "").trim();
  const eq = raw.indexOf("=");
  if (eq < 0) {
    u.send("Usage: @pcreate <name>=<password>");
    return;
  }

  const name = raw.slice(0, eq).trim();
  const password = raw.slice(eq + 1).trim();
  if (!name || !password) {
    u.send("Usage: @pcreate <name>=<password>");
    return;
  }
  if (password.length < 5) {
    u.send("Password must be at least 5 characters.");
    return;
  }
  if (/[#=/\s]/.test(name) || name.length > 32) {
    u.send("Invalid player name.");
    return;
  }

  const { isPlayerNameTaken } = await import("../main_utils.ts");
  if (await isPlayerNameTaken(name)) {
    u.send("That name is already taken.");
    return;
  }

  const hashed = await u.auth.hash(password);
  const start = getConfig<string>("game.playerStart") || "1";
  const player = await u.db.create({
    name,
    flags: new Set(["player"]),
    location: start,
    contents: [],
    state: { name, password: hashed, home: start },
  });

  log("warn", "ADMIN_PCREATE", {
    actor: u.me.id,
    target: player.id,
    name,
  });

  u.send(`Player ${name} created (#${player.id}).`);
}

addCmd({
  name: "@pcreate",
  pattern: /^@pcreate\s+(.*)/i,
  lock: "connected admin+",
  category: "admin",
  help: `@pcreate <name>=<password>  — Create a player account (admin+).

Does not log you in as the new character.

EXAMPLES
  @pcreate Builder=secretpass
  @pcreate Alice=welcome1`,
  exec: execPcreate,
});

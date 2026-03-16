import { IUrsamuSDK } from "../../src/@types/UrsamuSDK.ts";

/**
 * @motd          — display the current MOTD
 * @motd/set <text> — set the MOTD (admin/wizard only)
 * @motd/clear    — clear the MOTD (admin/wizard only)
 */
export default async (u: IUrsamuSDK) => {
  const switches = u.cmd.switches || [];
  const isAdmin = u.me.flags.has("admin") || u.me.flags.has("wizard") || u.me.flags.has("superuser");

  if (switches.includes("set")) {
    if (!isAdmin) {
      u.send("Permission denied.");
      return;
    }
    const text = (u.cmd.args[0] || "").trim();
    if (!text) {
      u.send("Usage: @motd/set <message of the day>");
      return;
    }
    await u.text.set("motd", text);
    u.send("MOTD updated.");
    return;
  }

  if (switches.includes("clear")) {
    if (!isAdmin) {
      u.send("Permission denied.");
      return;
    }
    await u.text.set("motd", "");
    u.send("MOTD cleared.");
    return;
  }

  // Display MOTD
  const motd = await u.text.read("motd");
  if (!motd) {
    u.send("No message of the day has been set.");
    return;
  }

  u.send("%ch%cy--- Message of the Day ---%cn");
  u.send(motd);
  u.send("%ch%cy--------------------------%cn");
};

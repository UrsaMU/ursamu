import { IUrsamuSDK } from "../../src/@types/UrsamuSDK.ts";

export const aliases = ["channel"];

const isStaff = (u: IUrsamuSDK) =>
  u.me.flags.has("admin") || u.me.flags.has("wizard") || u.me.flags.has("superuser");

/**
 * System Script: channels.ts
 * Manages game channels (join, leave, list, log, history, transcript).
 */
export default async (u: IUrsamuSDK) => {
  const switchArg = u.cmd.name.split("/")[1] || "";
  const args = u.cmd.args;

  switch (switchArg) {
    case "join": {
      if (!args[0]) {
        u.send("Usage: @channel/join <channel>=<alias>");
        return;
      }
      const [chan, alias] = args[0].split("=");
      if (!chan || !alias) {
        u.send("Usage: @channel/join <channel>=<alias>");
        return;
      }
      await u.chan.join(chan.trim(), alias.trim());
      u.send(`You have joined channel ${chan.trim()} with alias ${alias.trim()}.`);
      break;
    }
    case "leave": {
      const alias = args[0];
      if (!alias) {
        u.send("Usage: @channel/leave <alias>");
        return;
      }
      await u.chan.leave(alias.trim());
      u.send(`You have left the channel with alias ${alias.trim()}.`);
      break;
    }

    case "log": {
      // @channel/log <name>=on|off  (staff only)
      if (!isStaff(u)) {
        u.send(">CHANNELS: You don't have permission to change channel logging.");
        return;
      }
      const eqIdx = (args[0] || "").indexOf("=");
      if (eqIdx === -1) {
        u.send("Usage: @channel/log <channel>=on|off");
        return;
      }
      const chanName = args[0].slice(0, eqIdx).trim().toLowerCase();
      const toggle = args[0].slice(eqIdx + 1).trim().toLowerCase();
      if (toggle !== "on" && toggle !== "off") {
        u.send("Usage: @channel/log <channel>=on|off");
        return;
      }
      await u.chan.log(chanName, toggle === "on");
      u.send(`>CHANNELS: History logging for '${chanName}' is now ${toggle.toUpperCase()}.`);
      break;
    }

    case "history": {
      // @channel/history <name>  — last 50 messages
      const chanName = (args[0] || "").trim().toLowerCase();
      if (!chanName) {
        u.send("Usage: @channel/history <channel>");
        return;
      }
      const msgs = await u.chan.history(chanName, 50);
      if (msgs.length === 0) {
        u.send(`>CHANNELS: No history for '${chanName}' (logging may be off).`);
        return;
      }
      const lines = [`--- History: ${chanName} (last ${msgs.length}) ---`];
      for (const m of msgs) {
        const ts = new Date(m.timestamp).toLocaleTimeString();
        lines.push(`[${ts}] ${m.message}`);
      }
      lines.push("---");
      u.send(lines.join("\n"));
      break;
    }

    case "transcript": {
      // @channel/transcript <name>=<N>  — last N lines
      const eqIdx = (args[0] || "").indexOf("=");
      if (eqIdx === -1) {
        u.send("Usage: @channel/transcript <channel>=<lines>");
        return;
      }
      const chanName = args[0].slice(0, eqIdx).trim().toLowerCase();
      const n = Math.min(Math.max(parseInt(args[0].slice(eqIdx + 1).trim(), 10) || 50, 1), 500);
      const msgs = await u.chan.history(chanName, n);
      if (msgs.length === 0) {
        u.send(`>CHANNELS: No history for '${chanName}' (logging may be off).`);
        return;
      }
      const lines = [`--- Transcript: ${chanName} (${msgs.length} lines) ---`];
      for (const m of msgs) {
        const d = new Date(m.timestamp);
        const ts = `${d.toLocaleDateString()} ${d.toLocaleTimeString()}`;
        lines.push(`[${ts}] ${m.message}`);
      }
      lines.push("---");
      u.send(lines.join("\n"));
      break;
    }

    case "list":
    default: {
      const list = await u.chan.list();
      u.send("--- Channels ---");
      for (const chan of list as { name: string; alias?: string }[]) {
        u.send(`${chan.name} [${chan.alias || "No Alias"}]`);
      }
      u.send("----------------");
      break;
    }
  }
};

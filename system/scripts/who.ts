import { IUrsamuSDK } from "../../src/@types/UrsamuSDK.ts";

/**
 * System Script: who.ts
 * ESM Refactored, Production-ready, and Telnet-compatible.
 */
export default async (u: IUrsamuSDK) => {
  const players = (await u.db.search({ flags: /connected/i })).filter((p) => p.flags.has('player') && !p.flags.has('dark'));
  const width = (u.me.data?.termWidth as number) || 78;

  const formatIdle = (lastCmd: unknown): string => {
    if (typeof lastCmd !== "number" || isNaN(lastCmd)) return "---";
    const secs = Math.floor((Date.now() - lastCmd) / 1000);
    if (secs < 60) return `${secs}s`;
    const mins = Math.floor(secs / 60);
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    const days = Math.floor(hrs / 24);
    return `${days}d`;
  };

  // 1. Telnet Output
  let telnet = `%chWho's Online%cn\n`;
  telnet += `${"Player".padEnd(24)}${"Idle".padEnd(8)}Doing\n`;
  telnet += `${"-".repeat(width)}\n`;
  players.forEach((p) => {
    const pName = (p.state.moniker as string) || (p.state.name as string) || p.name || "Unknown";
    const idle = formatIdle(p.state.lastCommand);
    const doing = (p.state.doing as string) || "";
    telnet += `${pName.padEnd(24)}${idle.padEnd(8)}${doing}\n`;
  });
  telnet += `${"-".repeat(width)}\n`;
  telnet += `${players.length} player${players.length === 1 ? "" : "s"} online.\n`;
  u.send(telnet);

  // 2. Web UI
  u.ui.layout({
    components: [
      u.ui.panel({ type: "header", content: "Who's Online" }),
      u.ui.panel({ type: "table", content: [["Player", "Idle", "Doing"], ...players.map((p) => [
        p.name || "Unknown",
        formatIdle(p.state.lastCommand),
        (p.state.doing as string) || ""
      ])] }),
      u.ui.panel({ content: `${players.length} online.` })
    ],
    meta: { type: "who" }
  });
};

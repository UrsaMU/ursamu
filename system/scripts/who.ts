import { IUrsamuSDK } from "../../src/@types/UrsamuSDK.ts";

/**
 * System Script: who.ts
 * ESM Refactored, Production-ready, and Telnet-compatible.
 */
export default async (u: IUrsamuSDK) => {
  const players = (await u.db.search('connected')).filter((p) => p.flags.has('player') && !p.flags.has('dark'));

  // 1. Telnet Output
  let telnet = `%chWho's Online%cn\n`;
  telnet += `Player                  Doing\n`;
  telnet += `------------------------------------------------------------------------------\n`;
  players.forEach((p) => {
    const pName = (p.state.moniker as string) || (p.state.name as string) || p.name || "Unknown";
    const doing = (p.state.doing as string) || "";
    // Simple padding
    telnet += `${pName.padEnd(24)}${doing}\n`;
  });
  telnet += `------------------------------------------------------------------------------\n`;
  telnet += `${players.length} players online.\n`;
  u.send(telnet);

  // 2. Web UI
  u.ui.layout({
    components: [
      u.ui.panel({ type: "header", content: "Who's Online" }),
      u.ui.panel({ type: "table", content: [["Player", "Doing"], ...players.map((p) => [p.name || "Unknown", (p.state.doing as string) || ""])] }),
      u.ui.panel({ content: `${players.length} online.` })
    ],
    meta: { type: "who" }
  });
};

import { IUrsamuSDK, IDBObj } from "../../@types/UrsamuSDK.ts";

/**
 * Rhost Vision: who.ts
 * Rhost-style WHO list with On For, Idle, and Doing columns.
 */
export default async (u: IUrsamuSDK) => {
  const players = (await u.db.search({ flags: /connected/i })).filter(
    (p: IDBObj) => p.flags.has("player") && !p.flags.has("dark"),
  );

  const getLoginTime = (p: IDBObj): unknown => {
    return p.state.lastLogin || p.state.LASTLOGIN || null;
  };

  const formatOnFor = (lastLogin: unknown): string => {
    if (typeof lastLogin !== "number") return "   ??:??";
    const secs = Math.floor((Date.now() - lastLogin) / 1000);
    const days = Math.floor(secs / 86400);
    const hrs = Math.floor((secs % 86400) / 3600);
    const mins = Math.floor((secs % 3600) / 60);
    const hm = `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
    if (days > 0) return `${String(days).padStart(2)}d ${hm}`;
    return `   ${hm}`;
  };

  const formatIdle = (lastCmd: unknown): string => {
    if (typeof lastCmd !== "number") return "---";
    const secs = Math.floor((Date.now() - lastCmd) / 1000);
    if (secs < 60) return `${secs}s`;
    const mins = Math.floor(secs / 60);
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    const days = Math.floor(hrs / 24);
    return `${days}d`;
  };

  // Sort by login time (most recent last)
  players.sort((a: IDBObj, b: IDBObj) => {
    const aLogin = (a.state.lastLogin as number) || 0;
    const bLogin = (b.state.lastLogin as number) || 0;
    return bLogin - aLogin;
  });

  // Header — match Rhost column layout
  const lines: string[] = [];
  lines.push(
    `${"Player Name".padEnd(21)}${"On For".padStart(8)}  ${"Idle".padStart(4)}  Doing`,
  );

  // Players
  for (const p of players) {
    const pName = (p.state.moniker as string) ||
      (p.state.name as string) || p.name || "Unknown";
    const onFor = formatOnFor(getLoginTime(p));
    const idleRaw = formatIdle(p.state.lastCommand);
    const doing = (p.state.doing as string) || "";
    const idlePadded = idleRaw.padStart(4);
    lines.push(
      `${pName.padEnd(21)}${onFor.padStart(8)}  ${idlePadded}  ${doing}`,
    );
  }

  // Footer
  lines.push(
    `${players.length} Player${players.length === 1 ? "" : "s"} logged in.`,
  );

  u.send(lines.join("\n"));

  // Web UI
  u.ui.layout({
    components: [
      u.ui.panel({ type: "header", content: "Who's Online" }),
      u.ui.panel({
        type: "table",
        content: [
          ["Player", "On For", "Idle", "Doing"],
          ...players.map((p: IDBObj) => [
            (p.state.moniker as string) || (p.state.name as string) || p.name || "Unknown",
            formatOnFor(p.state.lastLogin),
            formatIdle(p.state.lastCommand),
            (p.state.doing as string) || "",
          ]),
        ],
      }),
      u.ui.panel({ content: `${players.length} online.` }),
    ],
    meta: { type: "who" },
  });
};

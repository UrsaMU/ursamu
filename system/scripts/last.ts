import { IUrsamuSDK } from "../../src/@types/UrsamuSDK.ts";

/**
 * @last [<player>]
 *
 * Show last login/logout timestamps for yourself or another player.
 * Admin can look up any player; others can only look up themselves.
 */
export default async (u: IUrsamuSDK) => {
  const actor = u.me;
  const isStaff = actor.flags.has("admin") || actor.flags.has("wizard") || actor.flags.has("superuser");
  const query = (u.cmd.args[0] || "").trim();

  let target = actor;
  if (query) {
    if (!isStaff) { u.send("Permission denied."); return; }
    const results = await u.db.search(query);
    const found = results.find(r => r.flags.has("player"));
    if (!found) { u.send(`No player found: "${query}".`); return; }
    target = found;
  }

  const name = (target.state.moniker as string) || (target.state.name as string) || target.name || target.id;
  const lastLogin  = target.state.lastLogin  as number | undefined;
  const lastLogout = target.state.lastLogout as number | undefined;

  const fmt = (ts: number | undefined) =>
    ts ? new Date(ts).toLocaleString() : "Never";

  u.send(`--- Last for ${name} ---`);
  u.send(`Last login:   ${fmt(lastLogin)}`);
  u.send(`Last logout:  ${fmt(lastLogout)}`);
  u.send(`Status:       ${target.flags.has("connected") ? "%chOnline%cn" : "Offline"}`);
};

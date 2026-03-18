import { IUrsamuSDK } from "../../src/@types/UrsamuSDK.ts";

/**
 * @find <name>           — search objects by name (case-insensitive partial match)
 * @find/flag <flag>      — search by flag
 * @find/type <type>      — search by type flag (room, thing, player, exit)
 */
export default async (u: IUrsamuSDK) => {
  const switches = u.cmd.switches || [];
  const arg = (u.cmd.args[0] || "").trim();

  if (!arg) {
    u.send("Usage: @find <name>  |  @find/flag <flag>  |  @find/type <type>");
    return;
  }

  let results;

  const escaped = arg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  if (switches.includes("flag")) {
    results = await u.db.search({ flags: new RegExp(escaped, "i") });
  } else if (switches.includes("type")) {
    results = await u.db.search({ flags: new RegExp(`\\b${escaped}\\b`, "i") });
  } else {
    // Name search — partial, case-insensitive
    results = await u.db.search({ "data.name": new RegExp(escaped, "i") });
  }

  if (!results.length) {
    u.send(`No objects found matching '${arg}'.`);
    return;
  }

  u.send(`%chFound ${results.length} object${results.length === 1 ? "" : "s"}:%cn`);
  for (const obj of results) {
    const name = (obj.state?.name as string) || obj.name || "(unnamed)";
    const flagList = obj.flags instanceof Set ? [...obj.flags].join(" ") : String(obj.flags);
    u.send(`  #${obj.id}  ${name}  [${flagList}]`);
  }
};

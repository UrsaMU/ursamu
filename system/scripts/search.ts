import { IUrsamuSDK, IDBObj } from "../../src/@types/UrsamuSDK.ts";

export const aliases = ["search", "stats"];

export default async (u: IUrsamuSDK) => {
  const cmd = u.cmd.original?.toLowerCase() || u.cmd.name.toLowerCase();

  if (cmd.includes("stats")) {
      await handleStats(u);
  } else {
      await handleSearch(u);
  }
};

async function handleStats(u: IUrsamuSDK) {
    // We need counts. SDK `u.db.search` returns arrays.
    // Ideally we want count.
    // `u.db.search` might be expensive if we fetch all.
    // But `dbojs.all()` was used in `search.ts`.
    // I will use `u.db.search({})` for all?
    // `u.db.search` signature: `query: Query<T>`.
    
    // We might need to expose count or optimize.
    // For now, fetch all IDs?
    // u.db doesn't expose count.
    // I'll grab all and count.
    const all = await u.db.search({}); // query all?
    const players = all.filter((o: IDBObj) => o.flags.has("player"));
    const rooms = all.filter((o: IDBObj) => o.flags.has("room"));
    const exits = all.filter((o: IDBObj) => o.flags.has("exit"));
    const things = all.length - players.length - rooms.length - exits.length;
    
    // Formatting
    const Header = (text: string) => `=== ${text} ===`; // simplified center
    
    const output = [
        Header("Server Statistics"),
        `Total Objects: ${all.length}`,
        `Rooms: ${rooms.length}`,
        `Exits: ${exits.length}`,
        `Things: ${things}`,
        `Players: ${players.length}`,
        Header("")
    ].join("\n");
    
    u.send(output);
}

async function handleSearch(u: IUrsamuSDK) {
    // @search query
    // args: ["query=val"] or ["query"]
    const input = (u.cmd.args[0] || "").trim();
    const parts = input.split("=");
    // deno-lint-ignore no-explicit-any
    let search: any = {};
    
    if (parts.length > 1) {
        const [key, val] = parts;
        if (key.trim() === "name") {
             search = { "data.name": new RegExp(val.trim(), "i") };
        } else if (key.trim().match(/^flags?$/i)) {
             search = { flags: new RegExp(val.trim(), "i") };
        } else if (key.trim() === "owner") {
             // Resolve owner name
             const owner = await u.db.search({ "data.name": new RegExp(`^${val.trim()}$`, "i"), flags: /player/i });
             if (owner.length > 0) {
                 search = { "data.owner": owner[0].id };
             } else {
                 return u.send("Owner not found.");
             }
        } else {
             return u.send("Invalid search parameter.");
        }
    } else {
        search = { "data.name": new RegExp(input.trim(), "i") };
    }
    
    const results = await u.db.search(search);
    if (results.length === 0) return u.send("No matches found.");

    const MAX_RESULTS = 100;
    const limited = results.slice(0, MAX_RESULTS);
    const list = limited.map(r => `${r.name}(#${r.id})`).join("\n");
    u.send(list);
    if (results.length > MAX_RESULTS) {
      u.send(`(Showing first ${MAX_RESULTS} of ${results.length} results. Narrow your search.)`);
    }
}

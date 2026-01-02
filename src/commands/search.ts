import { dbojs } from "../services/Database/index.ts";
import { send } from "../services/broadcast/index.ts";
import { addCmd } from "../services/commands/index.ts";
import { center, columns } from "../utils/format.ts";

export default () => {
  addCmd({
    name: "@search",
    pattern: /^@search\s+(.*)/i,
    lock: "connected builder+",
    help: "Search for objects",
    category: "admin",
    exec: async (ctx, args) => {
      if (!ctx.socket.cid) return;
      const en = await dbojs.queryOne({ id: ctx.socket.cid });
      if (!en) return;

      const [query] = args;
      const parts = query.split("=");
      
      let search = {};
      
      // Simple parsing: class=value or just name part
      if (parts.length > 1) {
          const [key, val] = parts;
          if (key.trim() === "name") {
              search = { "data.name": new RegExp(val.trim(), "i") };
          } else if (key.trim() === "flag" || key.trim() === "flags") {
              search = { flags: new RegExp(val.trim(), "i") };
          } else if (key.trim() === "owner") {
              // Resolving owner name to ID would be better, but regex for now if we don't have ID 
              // Wait, owners are stored as IDs. We need to resolve the name to ID first.
              const ownerObj = await dbojs.queryOne({ "data.name": new RegExp(`^${val.trim()}$`, "i"), flags: /player/i });
              if (ownerObj) {
                  search = { "data.owner": ownerObj.id };
              } else {
                   return send([ctx.socket.id], "Owner not found.");
              }
          } else {
               // Default to attribute search? or error?
               return send([ctx.socket.id], "Invalid search parameter. Use name=..., flags=..., or owner=...");
          }
      } else {
          // Default search by name
          search = { "data.name": new RegExp(query.trim(), "i") };
      }

      const results = await dbojs.query(search);
      
      if (!results.length) {
          return send([ctx.socket.id], "No matches found.");
      }
      
      const list = results.map(r => `${r.data?.name}(#${r.id})`); // Simplified list
      send([ctx.socket.id], center(" Search Results ", 78, "="));
      send([ctx.socket.id], columns(list, 80, 4));
      send([ctx.socket.id], center("", 78, "="));
    }
  });
  
  addCmd({
      name: "@stats",
      pattern: /^@stats$/i,
      lock: "connected",
      help: "Show server statistics",
      category: "info",
      exec: async (ctx) => {
          const total = (await dbojs.all()).length;
          const players = (await dbojs.query({ flags: /player/i })).length;
          const rooms = (await dbojs.query({ flags: /room/i })).length;
          const exits = (await dbojs.query({ flags: /exit/i })).length;

           
           const calcThings = total - players - rooms - exits;
           
           send([ctx.socket.id], center(" Server Statistics ", 78, "="));
           send([ctx.socket.id], `Total Objects: ${total}`);
           send([ctx.socket.id], `Rooms: ${rooms}`);
           send([ctx.socket.id], `Exits: ${exits}`);
           send([ctx.socket.id], `Things: ${calcThings}`);
           send([ctx.socket.id], `Players: ${players}`);
           send([ctx.socket.id], center("", 78, "="));
      }
  });
};

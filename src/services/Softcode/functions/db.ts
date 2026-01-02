import { registerFunction } from "./registry.ts";

import { target } from "../../../utils/target.ts";
import { getAttribute } from "../../../utils/getAttribute.ts";
import { dbojs } from "../../../services/Database/index.ts";
import type { IDBOBJ } from "../../../@types/IDBObj.ts";
import { displayName } from "../../../utils/displayName.ts";
import { canEdit } from "../../../utils/canEdit.ts";

const getEnactor = (data: Record<string, unknown>): IDBOBJ | undefined => {
  return data.enactor as IDBOBJ;
};

registerFunction("name", async (args, data) => {
  const enactor = getEnactor(data);
  if (!enactor) return "#-1 NO ENACTOR";
  const obj = await target(enactor, args[0] || "me", true);
  if (!obj) return "#-1 NO MATCH";
  return displayName(enactor, obj, await canEdit(enactor, obj));
});

registerFunction("loc", async (args, data) => {
  const enactor = getEnactor(data);
  if (!enactor) return "#-1 NO ENACTOR";
  const obj = await target(enactor, args[0] || "me", true);
  if (!obj) return "#-1 NO MATCH";
  return obj.location || "#-1";
});

registerFunction("flags", async (args, data) => {
  const enactor = getEnactor(data);
  if (!enactor) return "#-1 NO ENACTOR";
  const obj = await target(enactor, args[0] || "me", true);
  if (!obj) return "#-1 NO MATCH";
  return obj.flags || "";
});

registerFunction("owner", async (args, data) => {
    const enactor = getEnactor(data);
    if (!enactor) return "#-1 NO ENACTOR";
    const obj = await target(enactor, args[0] || "me", true);
    if (!obj) return "#-1 NO MATCH";
    
    // In UrsaMU currently, owner might not be explicit? 
    // Usually it's in data.owner or just the object ID if it's a player?
    // If obj is player, owner is self.
    // If obj is thing/room/exit, owner is data.owner?
    // Let's check IDBObj type if I could... assuming data.owner or default to self if player.
    if (obj.flags.includes("player")) return "#" + obj.id;
    // deno-lint-ignore no-explicit-any
    return (obj.data as any).owner || ("#" + obj.id);
});

registerFunction("controls", async (args, data) => {
    const enactor = getEnactor(data);
    if (!enactor) return "#-1 NO ENACTOR";
    const runEnactor = await target(enactor, args[0] || "me", true);
    const obj = await target(enactor, args[1] || "me", true);
    
    if (!runEnactor || !obj) return "0";
    return (await canEdit(runEnactor, obj)) ? "1" : "0";
});

registerFunction("nearby", async (args, data) => {
    const enactor = getEnactor(data);
    if (!enactor) return "#-1 NO ENACTOR";
    const obj1 = await target(enactor, args[0] || "me", true);
    const obj2 = await target(enactor, args[1] || "here", true);
    
    if (!obj1 || !obj2) return "0";
    return (obj1.location === obj2.location || obj1.location === obj2.id || obj2.location === obj1.id) ? "1" : "0";
});

registerFunction("room", async (args, data) => {
    const enactor = getEnactor(data);
    if (!enactor) return "#-1 NO ENACTOR";
    let obj = await target(enactor, args[0] || "me", true);
    if (!obj) return "#-1 NO MATCH";
    
    // Traverse up
    let safety = 0;
    while (obj && !obj.flags.includes("room") && safety < 100) {
        if (!obj.location) break;
        obj = await dbojs.queryOne({id: obj.location});
        safety++;
    }
    
    if (obj && obj.flags.includes("room")) return "#" + obj.id;
    return "#-1";
});

registerFunction("zone", async (args, data) => {
    const enactor = getEnactor(data);
    if (!enactor) return "#-1 NO ENACTOR";
    const obj = await target(enactor, args[0] || "me", true);
    if (!obj) return "#-1 NO MATCH";
    // deno-lint-ignore no-explicit-any
    return (obj.data as any).zone || "#-1";
});

registerFunction("parent", async (args, data) => {
    const enactor = getEnactor(data);
    if (!enactor) return "#-1 NO ENACTOR";
    const obj = await target(enactor, args[0] || "me", true);
    if (!obj) return "#-1 NO MATCH";
    // deno-lint-ignore no-explicit-any
    return (obj.data as any).parent || "#-1";
});

registerFunction("get", async (args, data) => {
  const enactor = getEnactor(data);
  if (!enactor) return "#-1 NO ENACTOR";
  
  const rawArg = args[0] || "";
  const slashIdx = rawArg.indexOf("/");
  
  let thingName = "me";
  let attrName = rawArg;
  
  if (slashIdx !== -1) {
    thingName = rawArg.slice(0, slashIdx);
    attrName = rawArg.slice(slashIdx + 1);
  }
  
  const obj = await target(enactor, thingName, true);
  if (!obj) return "#-1 NO MATCH";
  
  const attr = await getAttribute(obj, attrName);
  return attr?.value || "";
});

registerFunction("lcon", async (args, data) => {
  const enactor = getEnactor(data);
  if (!enactor) return "#-1 NO ENACTOR";
  
  const obj = await target(enactor, args[0] || "here", true);
  if (!obj) return "#-1 NO MATCH";
  
  // Query for items where location is obj.id
  // Standard lcon usually includes everything? No, usually excludes exits.
  // MUX: lcon(here) -> returns contents. lexits(here) -> returns exits.
  const contents = await dbojs.query({ location: obj.id });
  return contents
    .filter((c) => !c.flags.includes("exit"))
    .map((c) => "#" + c.id)
    .join(" ");
});

registerFunction("lexits", async (args, data) => {
  const enactor = getEnactor(data);
  if (!enactor) return "#-1 NO ENACTOR";
  const obj = await target(enactor, args[0] || "here", true);
  if (!obj) return "#-1 NO MATCH";

  const exits = await dbojs.query({ location: obj.id });
  return exits
    .filter((c) => c.flags.includes("exit"))
    .map((c) => "#" + c.id)
    .join(" ");
});

registerFunction("lthings", async (args, data) => {
  const enactor = getEnactor(data);
  if (!enactor) return "#-1 NO ENACTOR";
  const obj = await target(enactor, args[0] || "here", true);
  if (!obj) return "#-1 NO MATCH";

  const things = await dbojs.query({ location: obj.id });
  return things
    .filter(
      (c) =>
        !c.flags.includes("exit") &&
        !c.flags.includes("room") &&
        !c.flags.includes("player")
    )
    .map((c) => "#" + c.id)
    .join(" ");
});

registerFunction("lplayers", async (args, data) => {
  const enactor = getEnactor(data);
  if (!enactor) return "#-1 NO ENACTOR";
  const obj = await target(enactor, args[0] || "here", true);
  if (!obj) return "#-1 NO MATCH";

  const players = await dbojs.query({ location: obj.id });
  return players
    .filter((c) => c.flags.includes("player"))
    .map((c) => "#" + c.id)
    .join(" ");
});

registerFunction("idle", async (args, data) => {
  const enactor = getEnactor(data);
  if (!enactor) return "#-1 NO ENACTOR";
  
  const obj = await target(enactor, args[0] || "me", true);
  if (!obj) return "#-1 NO MATCH";
  
  // deno-lint-ignore no-explicit-any
  const lastCommand = (obj.data as any).lastCommand || 0;
  if (!lastCommand) return "-1"; // Never active? Or just a long time.
  
  const diff = Math.floor((Date.now() - lastCommand) / 1000);
  return diff.toString();
});

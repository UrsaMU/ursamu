import { registerFunction } from "./registry.ts";
import { dbojs } from "../../Database/index.ts";
import { send } from "../../broadcast/index.ts";
import { target } from "../../../utils/target.ts";
import { canEdit } from "../../../utils/canEdit.ts";
import type { IDBOBJ } from "../../../@types/IDBObj.ts";

const getEnactor = (data: Record<string, unknown>): IDBOBJ | undefined => {
  return data.enactor as IDBOBJ;
};

registerFunction("emit", async (args, data) => {
  const enactor = getEnactor(data);
  if (!enactor || !enactor.location) return "";
  
  // Find all connected players in the location
  // We need to query for objects in the location that are players and connected?
  // Or just rely on send? 
  // send() now iterates sockets. If we pass the Room ID as a target, wsService won't match connection.cid or socket.id.
  // So we must resolve targets.
  
  const contents = await dbojs.query({ location: enactor.location });
  // Filter for potential listeners (players/puppets). For now, just send to CIDs of contents.
  const targets = contents.map(c => c.id);
  
  send(targets, args[0] || "");
  return "";
});

registerFunction("pemit", async (args, data) => {
  const enactor = getEnactor(data);
  if (!enactor) return "";
  
  const obj = await target(enactor, args[0], true);
  if (!obj) return "#-1 NO MATCH";
  
  send([obj.id], args[1] || "");
  return "";
});

registerFunction("set", async (args, data) => {
  const enactor = getEnactor(data);
  if (!enactor) return "#-1 NO ENACTOR";
  
  const rawArg = args[0] || "";
  const value = args[1] || "";
  const slashIdx = rawArg.indexOf("/");
  
  let thingName = "me";
  let attrName = rawArg;
  
  if (slashIdx !== -1) {
    thingName = rawArg.slice(0, slashIdx);
    attrName = rawArg.slice(slashIdx + 1);
  }
  
  const obj = await target(enactor, thingName, true);
  if (!obj) return "#-1 NO MATCH";
  
  if (!await canEdit(enactor, obj)) return "#-1 PERMISSION DENIED";
  
  // Update attribute
  obj.data ||= {};
  obj.data.attributes ||= [];
  
  const attrIdx = obj.data.attributes.findIndex(a => a.name.toLowerCase() === attrName.toLowerCase());
  
  if (attrIdx !== -1) {
    obj.data.attributes[attrIdx].value = value;
    obj.data.attributes[attrIdx].setter = enactor.id;
  } else {
    obj.data.attributes.push({
        name: attrName.toUpperCase(),
        value: value,
        setter: enactor.id
    });
  }
  
  await dbojs.modify({ id: obj.id }, "$set", obj);
  return "";
});

import { registerFunction } from "./registry.ts";

import { target } from "../../../utils/target.ts";
import type { IDBOBJ } from "../../../@types/IDBObj.ts";

const getEnactor = (data: Record<string, unknown>): IDBOBJ | undefined => {
  return data.enactor as IDBOBJ;
};

registerFunction("name", async (args, data) => {
  const enactor = getEnactor(data);
  if (!enactor) return "#-1 NO ENACTOR";
  const obj = await target(enactor, args[0] || "me", true);
  if (!obj) return "#-1 NO MATCH";
  return obj.data?.name || "";
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
  
  const attr = obj.data?.attributes?.find(a => a.name.toLowerCase() === attrName.toLowerCase());
  return attr?.value || "";
});

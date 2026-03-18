import { IUrsamuSDK } from "../../src/@types/UrsamuSDK.ts";
// import { IDBObj } from "../../src/@types/UrsamuSDK.ts";

export const aliases = ["nameformat", "descformat", "conformat", "exitformat"];

export default async (u: IUrsamuSDK) => {
  const cmd = u.cmd.original?.toLowerCase() || u.cmd.name.toLowerCase();
  const input = (u.cmd.args[0] || "").trim();
  const [name, format] = input.split("=");

  const target = await u.util.target(u.me, name?.trim());
  if (!target) return u.send("I can't find that.");

  if (!(await u.canEdit(u.me, target))) return u.send("Permission denied.");

  let attrName = "";
  if (cmd.includes("nameformat")) attrName = "NAMEFORMAT";
  else if (cmd.includes("descformat")) attrName = "DESCFORMAT";
  else if (cmd.includes("conformat")) attrName = "CONFORMAT";
  else if (cmd.includes("exitformat")) attrName = "EXITFORMAT";

  if (!attrName) return u.send("Unknown format command.");

  // We are setting an attribute.
  // We need to manipulate the `attributes` array in `state`.
  // SDK assumes `state` is a Record.
  // Attributes are usually stored in `data.attributes` array in current DB schema.
  // `target.state` merges `data` and `data.state`.
  // `attributes` might be exposed on `target` or `target.state`.
  // Checking `DBObjs.ts` hydrate: `state = { ...data, ...data.state }`.
  // So `attributes` (from `data.attributes`) should be in `target.state.attributes`.
  
  // deno-lint-ignore no-explicit-any
  const attributes = (target.state.attributes as any[]) || [];
  // deno-lint-ignore no-explicit-any
  const existingIndex = attributes.findIndex((a: any) => a.name === attrName);
  
  if (format) {
      const newAttr = {
          name: attrName,
          value: format.trim(),
          setter: u.me.id,
          type: "attribute"
      };
      
      if (existingIndex >= 0) {
          attributes[existingIndex] = newAttr;
      } else {
          attributes.push(newAttr);
      }
      u.send(`Set ${attrName} on ${target.name}.`);
  } else {
      // Clear
       if (existingIndex >= 0) {
          attributes.splice(existingIndex, 1);
          u.send(`Cleared ${attrName} on ${target.name}.`);
      } else {
          u.send(`${attrName} not set on ${target.name}.`);
      }
  }
  
  // Persist
  // We need to write back to `data.attributes`.
  // `target.state.attributes` is the modified array.
  // `u.db.modify` needs to update `data.attributes`.
  await u.db.modify(target.id, "$set", { "data.attributes": attributes });
};

import { IUrsamuSDK } from "../../src/@types/UrsamuSDK.ts";

export const aliases = ["setAttr"];

export default async (u: IUrsamuSDK) => {
  // CMD: &ATTR obj=value
  // Parser passes this as:
  // Intent: &ATTR -> mapped to setAttr
  // Args: ["obj=value"] (via my update to cmdParser? No, prefix map logic)
  // `prefixMap`: "&": "setAttr"
  // `scriptArgs = [msg.trim().slice(prefix.length).trim()]`
  // So if `&ATTR obj=value`
  // Args[0] = "ATTR obj=value"
  
  const raw = u.cmd.args[0];
  // Parse: ATTR obj=value
  // Split by first space to get ATTR
  const [attrHeader, ...rest] = raw.split(" ");
  const attrName = attrHeader.trim().toUpperCase();
  const restStr = rest.join(" ");
  
  const [targetName, value] = restStr.split("=");
  
  if (!attrName || !targetName) {
      return u.send("Usage: &ATTR <object>=<value>");
  }
  
  const target = await u.util.target(u.me, targetName.trim());
  if (!target) return u.send("Target not found.");

  if (!(await u.canEdit(u.me, target))) return u.send("Permission denied.");

  // deno-lint-ignore no-explicit-any
  const attributes = (target.state.attributes as any[]) || [];
  // deno-lint-ignore no-explicit-any
  const existingIndex = attributes.findIndex((a: any) => a.name === attrName);

  if (value !== undefined) { 
      const _newVal = value.trim(); 
      const actualValue = value; 
      
      const newAttr = {
          name: attrName,
          value: actualValue,
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
      // Remove
      if (existingIndex >= 0) {
          attributes.splice(existingIndex, 1);
          u.send(`Cleared ${attrName} on ${target.name}.`);
      } else {
          u.send(`${attrName} not set on ${target.name}.`);
      }
  }

  await u.db.modify(target.id, "$set", { data: { ...target.state, attributes } });
};

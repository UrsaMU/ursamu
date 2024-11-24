import { Obj } from "../DBObjs/DBObjs";

export const setAttr = async (
  obj: Obj,
  attr: string,
  value: string,
  setter: string,
) => {
  // Initialize attributes array if it doesn't exist
  obj.data ||= { attributes: [] };
  obj.data.attributes ||= [];

  const stat = obj.data.attributes.find((s) =>
    s.name.toLowerCase().startsWith(attr.toLowerCase())
  );

  if (stat) {
    // Update existing attribute
    stat.value = value;
  } else {
    // Create new attribute
    obj.data.attributes.push({
      name: attr,
      value: value,
      setter: setter,
      type: "attribute",
      data: {},
    });
  }

  await obj.save();
  return true;
};

export const getAttr = async (obj: Obj, stat: string, def: string = "") => {
  const s = obj.data?.attributes?.find((s) =>
    s.name.toLowerCase().startsWith(stat.toLowerCase())
  );
  if (!s) return def;
  return s.value;
};

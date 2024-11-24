import { Obj } from "../DBObjs/DBObjs";

export const setAttr = async (obj: Obj, attr: string, value: string) => {
  const stat = obj.data?.attributes?.find((s) =>
    s.name.startsWith(attr.toLowerCase())
  );
  if (!stat) return false;
  stat.value = value;
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

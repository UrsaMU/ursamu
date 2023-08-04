import { Obj } from "../DBObjs";

export const setAttr = async (obj: Obj, attr: string, value: string) => {
  const stat = obj.data?.stats?.find((s) =>
    s.name.startsWith(attr.toLowerCase())
  );
  if (!stat) return false;
  stat.value = value;
  await obj.save();
  return true;
};

export const getAttr = (obj: Obj, stat: string) => {
  const s = obj.data?.stats?.find((s) => s.name.startsWith(stat.toLowerCase()));
  if (!s) return "";
  return s.value;
};

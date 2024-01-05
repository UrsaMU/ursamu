import { IAttribute, Obj } from "../index.ts";

export const getAttr = async (tarObj: Obj, attrName: string) => {
  tarObj.data.attributes ||= [];
  const attr = tarObj.data.attributes.find((a: IAttribute) =>
    a.name.toLowerCase().startsWith(attrName.toLowerCase())
  );

  return attr;
};

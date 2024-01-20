import { IAttribute } from "../../index.ts";
import { Obj } from "../index.ts";

export const setAttribute = async (
  en: Obj,
  tar: Obj,
  key: string,
  value: any,
) => {
  tar.data.attributes ||= {};
  if (!value) {
    delete tar.data.attributes[key];
    await tar.save();
    return;
  }

  tar.data.attributes[key.toLowerCase()] = {
    key: key.toLowerCase(),
    value,
    tyoe: "string",
    setter: en.id,
    hidden: key.startsWith("_") ? true : false,
  };

  return await tar.save();
};

export const getAttribute = (tar: Obj, key: string): IAttribute => {
  if (!tar.attributes[key.toLowerCase()] && tar.data?.parent) {
    return getAttribute(tar.data.parent, key);
  }

  return tar.data?.attributes[key.toLowerCase()];
};

import { IAttribute, Obj } from "../index.ts";

export const setAttr = async (
  tarObj: Obj,
  attrName: string,
  value: string,
  setter: Obj,
) => {
  tarObj.data.attributes ||= [];
  const attr = tarObj.data.attributes.find((a: IAttribute) =>
    a.name.toLowerCase().startsWith(attrName.toLowerCase())
  );

  // If the attribute exists, update it. Otherwise, create it.
  // if there's no value, delete it.

  if (attr) {
    if (!value) {
      tarObj.data.attributes = tarObj.data.attributes.filter(
        (a: IAttribute) => a.name !== attr.name,
      );
      await tarObj.save();
      return;
    } else {
      attr.value = value;
      attr.setter = setter.dbref;
      await tarObj.save();
      return;
    }
  } else if (!attr && value) {
    tarObj.data.attributes ||= [];
    tarObj.data.attributes.push({
      name: attrName,
      value: value,
      setter: setter.dbref,
      type: "attribute",
    });
  }

  await tarObj.save();
};

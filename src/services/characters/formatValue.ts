import { IDBOBJ } from "../../@types";
import { Obj } from "../DBObjs";
import { IMStatEntry } from "./stats";

export const formatValue = (obj: IDBOBJ, stat: string): string => {
  const statEntry = obj.data?.stats?.find((s: IMStatEntry) =>
    s.name.toLowerCase().startsWith(stat.toLowerCase())
  );

  if (!statEntry) return "";

  if (statEntry.temp !== statEntry.value) {
    return `${statEntry.value}(${statEntry.temp})`;
  } else {
    return `${statEntry.value}`;
  }
};

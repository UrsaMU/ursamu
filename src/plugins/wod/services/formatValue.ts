import { IDBOBJ, IMStatEntry } from "../../../@types";

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

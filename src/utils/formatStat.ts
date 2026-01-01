import { capString } from "./capString.ts";
import { ljust } from "./format.ts";

export const formatStat = (
  stat: string,
  value: unknown,
  width = 24,
  right = false
) => {
  let valStr = String(value ?? "");
  if (!valStr) valStr = "";
  const hasVal = +(valStr) ? "" : `%ch%cx`;
  const valDisplay = +valStr !== 0 ? `%ch${valStr}%cn` : `%ch%cx0%cn`;
  if (!right) {
    return (
      ljust(
        `${hasVal}${capString(stat)}`,
        width - (valStr.length || 1),
        "%ch%cx.%cn"
      ) + valDisplay
    );
  }

  return (
    ljust(`${valStr.length > 0 ? "" : "%ch%cx"}${capString(stat)}:`, 12) +
    ljust(`%ch${capString(valStr)}%cn`, 25)
  );
};

import { capString } from "../../utils/capString";
import { ljust } from "../../utils/format";

export const formatStat = (
  stat: string,
  value: any,
  width = 24,
  right = false,
) => {
  if (typeof value === "number") value = value.toString();
  if (!value) value = "";
  const hasVal = !!+value ? "" : `%ch%cx`;
  const val = +value !== 0 ? `%ch${value}%cn` : `%ch%cx0%cn`;
  if (!right) {
    return (
      ljust(
        `${hasVal}${capString(stat)}`,
        width - (value?.length || 1),
        "%ch%cx.%cn",
      ) + val
    );
  }

  return (
    ljust(`${value.length > 0 ? "" : "%ch%cx"}${capString(stat)}:`, 12) +
    ljust(`%ch${capString(value)}%cn`, 25)
  );
};

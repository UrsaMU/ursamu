import { capString } from "./capString";
import { ljust, rjust } from "./format";

export const formatStat = (
  stat: string,
  value: any,
  width = 24,
  right = false
) => {
  if (typeof value === "number") value = value.toString();
  if (!value) value = "";
  const val = +value !== 0 ? `%ch${value}%cn` : `%ch%cx0%cn`;
  if (!right) {
    return (
      ljust(`${capString(stat)}`, width - (value?.length || 0), "%ch%cx.%cn") +
      val
    );
  }

  return (
    ljust(`${capString(stat)}:`, 12) + ljust(`%ch${capString(value)}%cn`, 25)
  );
};

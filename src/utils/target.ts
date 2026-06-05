import type { IDBOBJ } from "@ursamu/mush";
import { dbojs } from "@ursamu/mush";

/**
 * Resolve a target reference string relative to `en`.
 * Handles: "here", "me", "#dbref", name-prefix search.
 * Pass `global = true` to skip the location-proximity filter.
 */
export const target = async (
  en:     IDBOBJ,
  tar:    string,
  global?: boolean,
): Promise<IDBOBJ | undefined | false> => {
  if (!tar || ["here", "room"].includes(tar.toLowerCase())) {
    return en.location ? await dbojs.queryOne({ id: en.location }) : undefined;
  }
  if (tar.startsWith("#")) return await dbojs.queryOne({ id: tar.slice(1) });
  if (["me", "self"].includes(tar.toLowerCase())) return en;

  const namePat = new RegExp(`^${tar.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i");
  const all = await dbojs.query({ "data.name": namePat });
  const byAlias = tar.toLowerCase();
  const candidates = all.length
    ? all
    : await dbojs.query({}).then((objs) =>
        objs.filter((o) =>
          o.id === tar ||
          (o.data?.alias as string | undefined)?.toLowerCase() === byAlias
        )
      );

  if (!candidates.length) return undefined;
  if (global) return candidates[0];

  const found = candidates.find(obj =>
    obj.location && (
      (en.location && (obj.location === en.location || obj.id === en.location)) ||
      obj.location === en.id
    ),
  );
  return found ?? undefined;
};

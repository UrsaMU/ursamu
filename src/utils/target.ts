import type { IDBOBJ } from "../@types/IDBObj.ts";
import { dbojs } from "../services/Database/index.ts";

export const target = async (
  en: IDBOBJ,
  tar: string,
  global?: boolean
): Promise<IDBOBJ | undefined | false> => {
  if (!tar || ["here", "room"].includes(tar.toLowerCase())) {
    return en.location ? await dbojs.queryOne({ id: en.location }) : undefined;
  }

  if (tar.startsWith("#")) {
    return await dbojs.queryOne({ id: tar.slice(1) });
  }

  if (["me", "self"].includes(tar.toLowerCase())) {
    return en;
  }

  // Helper: escape regex metacharacters to prevent ReDoS from user-controlled data
  const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Collect all name-matching candidates, then pick the first one in the right location.
  // Using query() (not queryOne) so we can filter by location even if the first match is stale.
  const candidates = await dbojs.query({
    $where: function () {
      const searchPat = new RegExp(`^${escapeRegex(tar)}`, "i");
      const nameParts = (this.data?.name || "").split(";").map((p: string) => p.trim());
      return (
        nameParts.some((p) => searchPat.test(p)) ||
        this.id === tar ||
        (this.data?.alias as string | undefined)?.toLowerCase() === tar.toLowerCase()
      );
    },
  });

  if (!candidates.length) {
    return undefined;
  }

  if (global) {
    return candidates[0];
  }

  // Prefer an object in the actor's current room or inventory
  const found = candidates.find((obj) =>
    obj.location && (
      (en.location && (obj.location === en.location || obj.id === en.location)) ||
      obj.location === en.id
    )
  );

  return found ?? undefined;
};

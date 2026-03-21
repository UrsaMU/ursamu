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

  // Sanitise the user-supplied target string so it is safe for use inside
  // the $where closure (no template-literal injection risk).
  const safeTar = String(tar).replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$/g, "\\$");

  const found = await (async () => {
    return await dbojs.queryOne({
      $where: function () {
        const target = safeTar;
        const tarLower = target.toLowerCase();
        // Simple string matching — no regex on user input
        const names = ((this.data?.name || "") as string).split(";").map((p: string) => p.trim().toLowerCase());
        return (
          names.some((n: string) => n === tarLower) ||
          this.id === target ||
          ((this.data?.alias as string | undefined) || "").toLowerCase() === tarLower
        );
      },
    });
  })();

  if (!found) {
    return undefined;
  }

  if (global) {
    return found;
  }

  // Found object is in actor's current room, IS the room, or is in actor's inventory
  if (found.location && (
      (en.location && (found.location === en.location || found.id === en.location)) ||
      found.location === en.id
  )) {
    return found;
  }

  return undefined;
};

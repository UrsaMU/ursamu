import type { IDBOBJ } from "../@types/IDBObj.ts";
import { flags } from "../services/flags/flags.ts";
import { dbojs } from "../services/Database/index.ts";
import { getSocket } from "./getSocket.ts";
import { evaluateLock, hydrate } from "./evaluateLock.ts";

export const setFlags = async (dbo: IDBOBJ, flgs: string, enactor?: IDBOBJ) => {
  if (enactor) {
    const changes = flgs.split(" ").filter((f) => f.trim());
    for (const change of changes) {
      const flagName = change.replace(/^!/, "");
      // @ts-ignore: Accessing internal tags property from @digibear/tags
      const flagDef = flags.tags.find(
        // deno-lint-ignore no-explicit-any
        (f: any) =>
          f.name.toLowerCase() === flagName.toLowerCase() ||
          f.code === flagName
      );

      if (flagDef) {
        if (flagDef.lock) {
          if (!(await evaluateLock(flagDef.lock, hydrate(enactor), hydrate(dbo)))) {
            throw new Error(`Permission denied: ${flagDef.name}`);
          }
        }
      }
    }
  }

  const { data, tags } = flags.set(dbo.flags, dbo.data || {}, flgs);
  dbo.flags = tags;
  dbo.data = data;

  await getSocket(dbo.id);
  const done = await dbojs.modify({ id: dbo.id }, "$set", dbo);

  return done.length ? done[0] : null;
};

/**
 * @module utils/flags
 *
 * Flag-level checks, privilege tests, and flag mutations for DB objects.
 */
import type { IDBOBJ } from "../@types/IDBObj.ts";
import type { IDBOBJ as IDBOBJIndex } from "../@types/index.ts";
import { type Obj, flags as flagSvc } from "../services/index.ts";
import { dbojs } from "../services/Database/index.ts";
import { getSocket } from "./session.ts";
import { evaluateLock, hydrate } from "./evaluateLock.ts";

// ---------------------------------------------------------------------------
// Privilege level helpers
// ---------------------------------------------------------------------------

/** True when the object holds admin (lvl ≥ 8) or higher privileges. */
export const isAdmin = (en: IDBOBJ): boolean =>
  (flagSvc.lvl(en.flags) || 0) >= 8;

/**
 * True when the flag set contains wizard, admin, or superuser.
 * Accepts `Set<string>` from SDK (u.me.flags) or raw IDBOBJ.flags string.
 */
export function isStaff(flags: Set<string> | string): boolean {
  if (typeof flags === "string") {
    return flags.includes("admin") || flags.includes("wizard") || flags.includes("superuser");
  }
  return flags.has("admin") || flags.has("wizard") || flags.has("superuser");
}

/**
 * True when the flag set contains wizard or superuser (stricter than isStaff).
 * Accepts `Set<string>` from SDK (u.me.flags) or raw IDBOBJ.flags string.
 */
export function isWizard(flags: Set<string> | string): boolean {
  if (typeof flags === "string") {
    return flags.includes("wizard") || flags.includes("superuser");
  }
  return flags.has("wizard") || flags.has("superuser");
}

/** Check whether a DB object passes a flag expression. */
export const checkFlags = (tar: IDBOBJIndex | Obj, flgs: string): boolean =>
  flagSvc.check(tar.flags, flgs);

// ---------------------------------------------------------------------------
// Flag mutation
// ---------------------------------------------------------------------------

/**
 * Apply a flag change string to a DB object, persisting the result.
 * Respects flag lock definitions — throws if the enactor lacks permission.
 */
export const setFlags = async (
  dbo:     IDBOBJ,
  flgs:    string,
  enactor?: IDBOBJ,
): Promise<IDBOBJ | null> => {
  if (enactor) {
    const changes = flgs.split(" ").filter(f => f.trim());
    for (const change of changes) {
      const flagName = change.replace(/^!/, "");
      // @ts-ignore: Accessing internal tags property from @digibear/tags
      const flagDef = flagSvc.tags.find(
        // deno-lint-ignore no-explicit-any
        (f: any) => f.name.toLowerCase() === flagName.toLowerCase() || f.code === flagName,
      );
      if (flagDef?.lock) {
        if (!(await evaluateLock(flagDef.lock, hydrate(enactor), hydrate(dbo)))) {
          throw new Error(`Permission denied: ${flagDef.name}`);
        }
      }
    }
  }

  const { data, tags } = flagSvc.set(dbo.flags, dbo.data || {}, flgs);
  dbo.flags = tags;
  dbo.data  = data;

  await getSocket(dbo.id);
  const done = await dbojs.modify({ id: dbo.id }, "$set", dbo);
  return done.length ? done[0] : null;
};

// ---------------------------------------------------------------------------
// Edit permission
// ---------------------------------------------------------------------------

/**
 * True when `en` is allowed to modify `tar`.
 * Superusers and self-edits always pass; otherwise evaluates the object lock.
 */
export const canEdit = async (en: IDBOBJ, tar: IDBOBJ): Promise<boolean> => {
  if (en.flags.includes("superuser") || en.id === tar.id) return true;
  if (tar.data?.lock) {
    return await evaluateLock(tar.data.lock as string, hydrate(en), hydrate(tar));
  }
  return (flagSvc.lvl(en.flags) || 0) > (flagSvc.lvl(tar.flags) || 0);
};

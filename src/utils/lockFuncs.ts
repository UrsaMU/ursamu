import type { IDBObj } from "../@types/UrsamuSDK.ts";
import { flags } from "../services/flags/flags.ts";

/**
 * A lock function that determines whether an enactor may access a target.
 * @param enactor - The object attempting access.
 * @param target - The object being accessed.
 * @param args - Parsed arguments from the lock expression.
 * @returns `true` to grant access, `false` to deny.
 */
export type LockFunc = (
  enactor: IDBObj,
  target: IDBObj,
  args: string[],
) => Promise<boolean> | boolean;

const registry = new Map<string, LockFunc>();
const RESERVED = new Set<string>();

// Internal-only: registers a built-in and marks its name as reserved.
function registerBuiltin(name: string, fn: LockFunc): void {
  const key = name.toLowerCase();
  registry.set(key, fn);
  RESERVED.add(key);
}

/**
 * Registers a custom lock function under the given name.
 * Built-in names (`flag`, `attr`, `type`, `is`, `holds`, `perm`) are
 * protected — calls using those names silently no-op.
 * @param name - Case-insensitive name used in lock expressions.
 * @param fn - The lock function to register.
 */
export function registerLockFunc(name: string, fn: LockFunc): void {
  const key = name.toLowerCase();
  if (RESERVED.has(key)) return;
  registry.set(key, fn);
}

/**
 * Invokes a registered lock function by name.
 * Fail-closed: returns `false` for unknown names and swallows thrown errors.
 * @param name - The lock function name to look up.
 * @param enactor - The object attempting access.
 * @param target - The object being accessed.
 * @param args - Parsed arguments from the lock expression.
 * @returns `true` if access is granted, `false` otherwise.
 */
export async function callLockFunc(
  name: string,
  enactor: IDBObj,
  target: IDBObj,
  args: string[],
): Promise<boolean> {
  const fn = registry.get(name.toLowerCase());
  if (!fn) return false;
  try {
    return await fn(enactor, target, args);
  } catch (_e: unknown) {
    return false;
  }
}

/** `flag(<flagname>)` — grants access if the enactor holds the named flag. */
registerBuiltin("flag", (enactor, _target, args) => {
  return enactor.flags.has((args[0] ?? "").trim().toLowerCase());
});

/** `attr(<attr>[=<value>])` — grants access if the enactor has the attribute, optionally matching a value. */
registerBuiltin("attr", (enactor, _target, args) => {
  const attrName = (args[0] ?? "").trim();
  if (!Object.hasOwn(enactor.state, attrName)) return false;
  if (args.length < 2) return true;
  return String(enactor.state[attrName]) === args[1].trim();
});

/** `type(<typename>)` — grants access if the enactor's flags include the named type. */
registerBuiltin("type", (enactor, _target, args) => {
  return enactor.flags.has((args[0] ?? "").trim().toLowerCase());
});

/** `is(<dbref>)` — grants access if the enactor's id matches the given dbref. */
registerBuiltin("is", (enactor, _target, args) => {
  const dbref = (args[0] ?? "").trim();
  return enactor.id === dbref.replace(/^#/, "");
});

/** `holds(<dbref>)` — grants access if the enactor's inventory contains the given dbref. */
registerBuiltin("holds", (enactor, _target, args) => {
  const dbref = (args[0] ?? "").trim().replace(/^#/, "");
  return enactor.contents.some((c) => c.id === dbref);
});

/** `perm(<level>)` — grants access if the enactor's flags satisfy the named permission level. */
registerBuiltin("perm", (enactor, _target, args) => {
  const permLevel = (args[0] ?? "").trim();
  const flagStr = Array.from(enactor.flags).join(" ");
  return flags.check(flagStr, permLevel);
});

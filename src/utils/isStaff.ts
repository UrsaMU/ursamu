/**
 * Returns true when the flag set contains wizard, admin, or superuser.
 * Accepts the Set<string> from IUrsamuSDK (u.me.flags) or the raw
 * space-separated string stored on IDBOBJ.flags.
 */
export function isStaff(flags: Set<string> | string): boolean {
  if (typeof flags === "string") {
    return flags.includes("admin") || flags.includes("wizard") || flags.includes("superuser");
  }
  return flags.has("admin") || flags.has("wizard") || flags.has("superuser");
}

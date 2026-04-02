/**
 * Returns true when the flag set contains wizard, admin, or superuser.
 * Works with the Set<string> exposed by IUrsamuSDK (u.me.flags).
 */
export function isStaff(flags: Set<string>): boolean {
  return flags.has("admin") || flags.has("wizard") || flags.has("superuser");
}

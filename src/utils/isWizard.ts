/**
 * Returns true when the flag set contains wizard or superuser.
 * Use for wizard+ permission checks (stricter than isStaff, which includes admin).
 * Accepts Set<string> from IUrsamuSDK (u.me.flags) or the raw IDBOBJ.flags string.
 */
export function isWizard(flags: Set<string> | string): boolean {
  if (typeof flags === "string") {
    return flags.includes("wizard") || flags.includes("superuser");
  }
  return flags.has("wizard") || flags.has("superuser");
}

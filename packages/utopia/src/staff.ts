import type { IUrsamuSDK } from "@ursamu/mush";

export function isStaff(u: IUrsamuSDK): boolean {
  const f = u.me.flags;
  return f.has("admin") || f.has("wizard") ||
    f.has("superuser");
}

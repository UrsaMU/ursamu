import { flags as _flags } from "@ursamu/mush";

export const checkFlags = (tar: { flags: string }, flgs: string): boolean =>
  _flags.check(tar.flags, flgs);

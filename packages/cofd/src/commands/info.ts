// +info command implementation: detail lookup across CoFD catalogs.

import type { IUrsamuSDK } from "@ursamu/ursamu";
import { renderInfo } from "../info/index.ts";

export function infoExec(u: IUrsamuSDK) {
  const sw = (u.cmd.args[0] ?? "").trim();
  const rest = u.util.stripSubs(u.cmd.args[1] ?? "").trim();
  const query = sw ? `${sw} ${rest}`.trim() : rest;
  u.send(renderInfo(query));
}

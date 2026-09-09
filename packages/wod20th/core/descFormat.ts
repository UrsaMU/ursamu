// core/descFormat.ts -- DESCFORMAT for plane-specific descriptions.
//
// Engine look (packages/mush look) resolves DESCFORMAT after the default
// description. When the viewer is on a non-material plane (state.reality),
// prefer state.<plane>Description if set via @desc/<plane>.

import type { IUrsamuSDK, IDBObj } from "@ursamu/mush";

/**
 * Return plane desc when the looker is off the material plane, else null
 * so the engine falls through to the normal description.
 */
export async function wodDescFormat(
  u: IUrsamuSDK,
  target: IDBObj,
  _defaultArg: string,
): Promise<string | null> {
  // deno-lint-ignore no-explicit-any
  const me = u.me as any;
  const reality = String(me?.state?.reality ?? "material")
    .toLowerCase()
    .trim();
  if (!reality || reality === "material") return null;

  // @desc/penumbra -> state.penumbraDescription
  const key = `${reality}Description`;
  // deno-lint-ignore no-explicit-any
  const bag = {
    ...((target as { data?: Record<string, unknown> }).data ?? {}),
    ...(target.state ?? {}),
  } as Record<string, unknown>;
  const plane = bag[key];
  if (typeof plane !== "string" || !plane.trim()) return null;

  if (typeof u.util?.parseDesc === "function") {
    return await u.util.parseDesc(plane, u.me, target);
  }
  return plane;
}

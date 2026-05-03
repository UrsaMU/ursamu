import type { IDBObj } from "../@types/UrsamuSDK.ts";
import type { IDBOBJ } from "../@types/IDBObj.ts";
import { dbojs } from "../services/Database/index.ts";
import { getAttribute } from "./getAttribute.ts";

/**
 * Parse a description string, substituting:
 *   - `%0` with the actor's display name, `%1`–`%9` with empty string (future use)
 *   - `[u(objId/attrName, arg0, arg1)]` with the evaluated result of that attribute
 */
/** Max number of [u()] patterns processed per description (DoS guard). */
const MAX_U_PATTERNS = 10;

export async function parseDesc(
  desc: string,
  actor: IDBObj,
  _target: IDBObj,
): Promise<string> {
  if (!desc) return desc;

  // Replace %0–%9: %0 = actor display name, %1–%9 = empty string
  const actorName = (actor.state?.moniker as string) ||
    (actor.state?.name as string) ||
    actor.name ||
    "Unknown";

  let result = desc
    .replace(/%0/g, actorName)
    .replace(/%[1-9]/g, "");

  // Find and replace [u(objId/attrName, arg0, arg1, ...)] patterns
  // Pattern: [u(target/attr)] or [u(target/attr, arg0)] or [u(target/attr, arg0, arg1, ...)]
  // Determine if the actor is privileged (admin/wizard/superuser)
  const isPrivileged = actor.flags.has("wizard") ||
    actor.flags.has("admin") ||
    actor.flags.has("superuser");

  const uPattern = /\[u\(([^)]+)\)\]/g;
  const allMatches = [...result.matchAll(uPattern)];

  if (allMatches.length === 0) return result;

  // Cap pattern count to prevent DoS (M2)
  const matches = allMatches.slice(0, MAX_U_PATTERNS);

  // Process matches in reverse to preserve indices
  const replacements: Array<{ start: number; end: number; value: string }> = [];

  for (const match of matches) {
    const full = match[0];
    const inner = match[1].trim();
    const start = match.index!;
    const end = start + full.length;

    // Parse: first token is "objId/attrName", rest are args
    const parts = inner.split(",").map((s) => s.trim());
    const objAttr = parts[0];
    const args = parts.slice(1);

    const slashIdx = objAttr.indexOf("/");
    if (slashIdx === -1) {
      // Malformed — no slash separating obj from attr
      replacements.push({ start, end, value: "" });
      continue;
    }

    const targetId = objAttr.slice(0, slashIdx).trim();
    const attrName = objAttr.slice(slashIdx + 1).trim();

    if (!targetId || !attrName) {
      replacements.push({ start, end, value: "" });
      continue;
    }

    // H4: Only allow cross-object [u()] evaluation for privileged actors.
    // Plain players may only reference the target object itself.
    if (!isPrivileged && targetId !== _target.id) {
      replacements.push({ start, end, value: "" });
      continue;
    }

    try {
      // Look up by id first, then by name
      let tarObj = await dbojs.queryOne({ id: targetId });
      if (!tarObj) {
        tarObj = await dbojs.queryOne({
          "data.name": new RegExp(
            `^${targetId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
            "i",
          ),
        }) || undefined;
      }

      if (!tarObj) {
        replacements.push({ start, end, value: "" });
        continue;
      }

      const attrData = await getAttribute(tarObj as unknown as IDBOBJ, attrName);
      if (!attrData) {
        replacements.push({ start, end, value: "" });
        continue;
      }

      const { sandboxService } = await import("../services/Sandbox/SandboxService.ts");
      const evalResult = await sandboxService.runScript(attrData.value, {
        id: tarObj.id,
        location: tarObj.location || "limbo",
        state: (tarObj.data?.state as Record<string, unknown>) || {},
        cmd: { name: "", args },
      });

      replacements.push({
        start,
        end,
        value: evalResult != null ? String(evalResult) : "",
      });
    } catch (_) {
      replacements.push({ start, end, value: "" });
    }
  }

  // Apply replacements in reverse order to preserve indices
  replacements.sort((a, b) => b.start - a.start);
  for (const { start, end, value } of replacements) {
    result = result.slice(0, start) + value + result.slice(end);
  }

  return result;
}

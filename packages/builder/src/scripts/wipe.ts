import type { IUrsamuSDK } from "jsr:@ursamu/ursamu";

/**
 * @wipe <object>[/<wildcard>]
 *
 * Erases attributes from an object immediately (no confirmation required).
 * TinyMUX rule: only attributes you have permission to modify are removed.
 *
 *   @wipe widget           — remove all user-set attributes
 *   @wipe widget/COLOR     — remove only the COLOR attribute
 *   @wipe widget/C*        — remove all attributes starting with C
 *   @wipe widget/*         — same as @wipe widget (all)
 *
 * Wildcard characters:
 *   *  matches any sequence of characters
 *   ?  matches a single character
 *
 * Examples:
 *   @wipe widget
 *   @wipe widget/DESC
 *   @wipe widget/DESC*
 */

/** Convert a TinyMUX-style wildcard pattern to a case-insensitive RegExp. */
function wildcardToRegex(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  const regStr  = escaped.replace(/\*/g, ".*").replace(/\?/g, ".");
  return new RegExp("^" + regStr + "$", "i");
}

export default async (u: IUrsamuSDK) => {
  const rawArg = (u.cmd.args[0] || "").trim();

  if (!rawArg) {
    u.send("Usage: @wipe <object>[/<wildcard>]");
    return;
  }

  // Split target from optional wildcard pattern: "widget/C*" → "widget", "C*"
  const slashIdx   = rawArg.indexOf("/");
  const targetName = slashIdx >= 0 ? rawArg.slice(0, slashIdx).trim() : rawArg;
  const wildcard   = slashIdx >= 0 ? rawArg.slice(slashIdx + 1).trim() : "";

  const results = await u.db.search(targetName);
  const target  = results[0];
  if (!target) { u.send(`I can't find '${targetName}'.`); return; }
  if (!(await u.canEdit(u.me, target))) { u.send("Permission denied."); return; }

  // deno-lint-ignore no-explicit-any
  const attrs = ((target.state.attributes as any[]) || []);

  // Filter by wildcard (if given)
  let toWipe: typeof attrs;
  let remaining: typeof attrs;

  if (wildcard) {
    const re  = wildcardToRegex(wildcard);
    toWipe    = attrs.filter((a: { name: string }) => re.test(a.name));
    remaining = attrs.filter((a: { name: string }) => !re.test(a.name));
  } else {
    toWipe    = attrs;
    remaining = [];
  }

  if (toWipe.length === 0) {
    const msg = wildcard
      ? `No attributes matching '${wildcard}' on ${u.util.displayName(target, u.me)}.`
      : `${u.util.displayName(target, u.me)} has no attributes to wipe.`;
    u.send(msg);
    return;
  }

  await u.db.modify(target.id, "$set", { "data.attributes": remaining });
  u.send(
    `Wiped ${toWipe.length} attribute${toWipe.length === 1 ? "" : "s"} from ${u.util.displayName(target, u.me)}.`,
  );
};

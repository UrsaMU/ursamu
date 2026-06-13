import type { IUrsamuSDK } from "jsr:@ursamu/ursamu";

/**
 * TinyMUX @set — four forms:
 *
 *   @set <obj>=<ATTR>:<value>              — set attribute (TinyMUX canonical)
 *   @set <obj>=<ATTR>:                     — clear attribute
 *   @set <obj>=<ATTR>:_<fromobj>/<fromattr>— copy attribute from another object
 *   @set <obj>/<attr>=[!]<attrflag>        — set/clear an attribute flag
 *   @set <obj>/ATTR=<value>                — set attribute (backward compat)
 *   @set <obj>=[!]<FLAG> [<FLAG2> ...]     — set/clear flags
 *
 * Switches:
 *   /quiet  — suppress "Set." acknowledgement
 *
 * Attribute flags (recognised values):
 *   case, hidden, html, no_command, no_inherit, no_name, regexp, trace, visual, wizard
 *
 * Examples:
 *   @set widget=COLOR:red
 *   @set widget=COLOR:
 *   @set widget=DESC:_proto/DESC
 *   @set widget/COLOR=hidden
 *   @set widget/COLOR=!hidden
 *   @set widget=DARK
 *   @set widget=!DARK
 *   @set/quiet widget=DARK
 */

const ATTRFLAGS = new Set([
  "case", "hidden", "html", "no_command", "no_inherit",
  "no_name", "regexp", "trace", "visual", "wizard",
]);

function isAttrFlagToken(s: string): boolean {
  return ATTRFLAGS.has(s.replace(/^!/, "").toLowerCase());
}

export default async (u: IUrsamuSDK) => {
  const input   = (u.cmd.args[0] || "").trim();
  const quiet   = (u.cmd.switches || []).includes("quiet");

  function ack() { if (!quiet) u.send("Set."); }

  // ── Form: obj/ATTR=RHS ─────────────────────────────────────────────────────
  // Disambiguate between:
  //   attrflag form  → RHS is a recognised [!]attrflag token
  //   legacy attr    → RHS is any other value  (backward compat)
  const slashEqMatch = input.match(/^(.+?)\/([A-Za-z][A-Za-z0-9_]*)=(.*)$/);
  if (slashEqMatch) {
    const targetName = slashEqMatch[1].trim();
    const attrName   = slashEqMatch[2].trim().toUpperCase();
    const rhs        = slashEqMatch[3];

    const target = await u.util.target(u.me, targetName);
    if (!target) { u.send(`I can't find "${targetName}" here.`); return; }
    if (!(await u.canEdit(u.me, target))) { u.send("Permission denied."); return; }

    if (isAttrFlagToken(rhs.trim())) {
      // ── Attribute flag form ──────────────────────────────────────────────
      const removing = rhs.trim().startsWith("!");
      const flag     = rhs.trim().replace(/^!/, "").toLowerCase();
      const attrflags = ((target.state._attrflags ?? {}) as Record<string, string[]>);
      const current   = attrflags[attrName] ? [...attrflags[attrName]] : [];
      const updated   = removing
        ? current.filter(f => f !== flag)
        : current.includes(flag) ? current : [...current, flag];
      await u.db.modify(target.id, "$set", { "data._attrflags": { ...attrflags, [attrName]: updated } });
      ack();
      return;
    }

    // ── Legacy backward-compat: obj/ATTR=value ───────────────────────────
    if (!/^[A-Z0-9_]+$/.test(attrName)) {
      u.send("Invalid attribute name. Use letters, digits, and underscores only.");
      return;
    }
    if (rhs === "") {
      if (["id", "name", "flags", "location"].includes(attrName.toLowerCase())) {
        u.send("Cannot delete internal system properties.");
        return;
      }
      await u.db.modify(target.id, "$unset", { [`data.${attrName}`]: 1 });
    } else {
      if (rhs.length > 4096) { u.send("Value too long (max 4096 characters)."); return; }
      await u.db.modify(target.id, "$set", { [`data.${attrName}`]: rhs });
    }
    ack();
    return;
  }

  // ── Form: obj=ATTR:value  (TinyMUX canonical attribute) ───────────────────
  // Pattern: target=ATTRNAME:anything  (colon must follow a valid attr name)
  const colonMatch = input.match(/^(.+?)=([A-Z][A-Z0-9_]*):(.*)$/i);
  if (colonMatch) {
    const targetName = colonMatch[1].trim();
    const attrName   = colonMatch[2].trim().toUpperCase();
    const rhs        = colonMatch[3];       // may be empty (= clear)

    if (!/^[A-Z0-9_]+$/.test(attrName)) {
      u.send("Invalid attribute name. Use letters, digits, and underscores only.");
      return;
    }

    const target = await u.util.target(u.me, targetName);
    if (!target) { u.send(`I can't find "${targetName}" here.`); return; }
    if (!(await u.canEdit(u.me, target))) { u.send("Permission denied."); return; }

    // ── Copy form: obj=ATTR:_fromobj/fromattr ─────────────────────────────
    const copyMatch = rhs.match(/^_(.+?)\/([A-Za-z][A-Za-z0-9_]*)$/);
    if (copyMatch) {
      const fromName  = copyMatch[1].trim();
      const fromAttr  = copyMatch[2].trim().toUpperCase();
      const fromResults = await u.db.search(fromName);
      const fromObj   = fromResults[0];
      if (!fromObj) { u.send(`Cannot find source object: ${fromName}`); return; }
      const value = (fromObj.state[fromAttr] as string) ?? (fromObj.state[fromAttr.toLowerCase()] as string);
      if (value === undefined || value === null) {
        u.send(`${fromAttr} not set on ${u.util.displayName(fromObj, u.me)}.`);
        return;
      }
      await u.db.modify(target.id, "$set", { [`data.${attrName}`]: value });
      ack();
      return;
    }

    // ── Set / clear ────────────────────────────────────────────────────────
    if (rhs === "") {
      if (["id", "name", "flags", "location"].includes(attrName.toLowerCase())) {
        u.send("Cannot delete internal system properties.");
        return;
      }
      await u.db.modify(target.id, "$unset", { [`data.${attrName}`]: 1 });
    } else {
      if (rhs.length > 4096) { u.send("Value too long (max 4096 characters)."); return; }
      await u.db.modify(target.id, "$set", { [`data.${attrName}`]: rhs });
    }
    ack();
    return;
  }

  // ── Form: obj=FLAGS ────────────────────────────────────────────────────────
  const flagMatch = input.match(/^(.+?)=(\S.*)$/);
  if (!flagMatch) {
    u.send(
      "Usage:%r" +
      "  @set <obj>=<ATTR>:<value>           — set attribute%r" +
      "  @set <obj>=<ATTR>:                  — clear attribute%r" +
      "  @set <obj>=<ATTR>:_<from>/<attr>    — copy attribute%r" +
      "  @set <obj>/<attr>=[!]<attrflag>     — set attribute flag%r" +
      "  @set <obj>/ATTR=<value>             — set attribute (legacy)%r" +
      "  @set <obj>=[!]<FLAG>                — set/clear flag",
    );
    return;
  }

  const targetName = flagMatch[1].trim();
  const flagStr    = flagMatch[2].trim();
  const tokens     = flagStr.split(/\s+/);
  const invalid    = tokens.find(t => !/^!?[A-Za-z][A-Za-z0-9_]*$/.test(t));
  if (invalid) {
    u.send(`Invalid flag token: "${invalid}". Flags must be letters/digits only.`);
    return;
  }

  const target = await u.util.target(u.me, targetName);
  if (!target) { u.send(`I can't find "${targetName}" here.`); return; }
  if (!(await u.canEdit(u.me, target))) { u.send("Permission denied."); return; }

  await u.setFlags(target.id, flagStr);
  ack();
};

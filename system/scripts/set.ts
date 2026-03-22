import { IUrsamuSDK, IDBObj as _IDBObj } from "../../src/@types/UrsamuSDK.ts";

/**
 * System Script: set.ts
 *
 * Two modes:
 *   @set <target>/<ATTR>=<value>   — set a soft attribute
 *   @set <target>/<ATTR>=          — clear a soft attribute
 *   @set <target>=<FLAG>           — add a flag  (e.g. @set obj=DARK)
 *   @set <target>=!<FLAG>          — remove a flag (e.g. @set obj=!DARK)
 *   @set <target>=<F1> <F2> <!F3> — set/unset multiple flags at once
 */
export default async (u: IUrsamuSDK) => {
  const input = (u.cmd.args[0] || "").trim();

  // ── Mode detection ────────────────────────────────────────────────────────
  // Permissive attr regex — validates attribute name separately after capture
  const attrMatch = input.match(/^(.+?)\/(.+?)=(.*)$/);

  if (attrMatch) {
    // ── Attribute mode ──────────────────────────────────────────────────────
    const targetName = attrMatch[1].trim();
    const attribute  = attrMatch[2].trim().toUpperCase();
    const value      = attrMatch[3].trim();

    if (!/^[A-Z0-9_]+$/.test(attribute)) {
      u.send("Invalid attribute name. Use letters, digits, and underscores only.");
      return;
    }

    const target = await u.util.target(u.me, targetName);
    if (!target) { u.send(`I can't find "${targetName}" here.`); return; }
    if (!(await u.canEdit(u.me, target))) { u.send("Permission denied."); return; }

    let resultMsg: string;
    if (value === "") {
      if (["id", "name", "flags", "location"].includes(attribute.toLowerCase())) {
        u.send("Cannot delete internal system properties.");
        return;
      }
      await u.db.modify(target.id, "$unset", { [`data.${attribute}`]: 1 });
      resultMsg = `Attribute ${attribute} cleared on ${target.name}.`;
    } else {
      if (value.length > 4096) { u.send("Value too long (max 4096 characters)."); return; }
      const attrCount = target.state ? Object.keys(target.state).length : 0;
      if (!target.state?.[attribute] && attrCount >= 100) {
        u.send("Too many attributes (limit 100). Remove some before adding new ones.");
        return;
      }
      await u.db.modify(target.id, "$set", { [`data.${attribute}`]: value });
      resultMsg = `Set - ${target.name}/${attribute}: ${value}`;
    }

    u.send(resultMsg);
    u.ui.layout({
      components: [],
      meta: { type: "set", targetId: target.id, attribute, value: value || null, message: resultMsg },
    });

  } else {
    // ── Flag mode ───────────────────────────────────────────────────────────
    const flagMatch = input.match(/^(.+?)=(\S.*)$/);
    if (!flagMatch) {
      u.send(
        "Usage:%r" +
        "  @set <target>/<ATTR>=<value>   — set attribute%r" +
        "  @set <target>/<ATTR>=          — clear attribute%r" +
        "  @set <target>=<FLAG>           — add flag%r" +
        "  @set <target>=!<FLAG>          — remove flag"
      );
      return;
    }

    const targetName = flagMatch[1].trim();
    const flagStr    = flagMatch[2].trim();

    // Basic validation: each token must be an optional "!" followed by a word
    const tokens = flagStr.split(/\s+/);
    const invalid = tokens.find(t => !/^!?[A-Za-z][A-Za-z0-9_]*$/.test(t));
    if (invalid) {
      u.send(`Invalid flag token: "${invalid}". Flags must be letters/digits only.`);
      return;
    }

    const target = await u.util.target(u.me, targetName);
    if (!target) { u.send(`I can't find "${targetName}" here.`); return; }
    if (!(await u.canEdit(u.me, target))) { u.send("Permission denied."); return; }

    await u.setFlags(target.id, flagStr);

    const added   = tokens.filter(t => !t.startsWith("!")).map(t => t.toUpperCase());
    const removed = tokens.filter(t =>  t.startsWith("!")).map(t => t.slice(1).toUpperCase());
    const parts: string[] = [];
    if (added.length)   parts.push(`+${added.join(",")}`);
    if (removed.length) parts.push(`-${removed.join(",")}`);

    u.send(`Flags (${parts.join(" ")}) applied to ${u.util.displayName(target, u.me)}.`);
  }
};

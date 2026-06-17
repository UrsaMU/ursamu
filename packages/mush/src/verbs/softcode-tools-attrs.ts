import { addCmd } from "../commands/addCmd.ts";
import type { IUrsamuSDK } from "../commands/types.ts";
import { Obj } from "../world/dbobjs.ts";
import type { IAttribute } from "../world/types.ts";
import { globToRegex } from "./softcode-tools.ts";

// ── Shared helpers ────────────────────────────────────────────────────────

function isStaff(flags: Set<string> | string): boolean {
  const s = typeof flags === "string" ? flags : [...flags].join(" ");
  return s.includes("admin") || s.includes("wizard") || s.includes("superuser");
}

// ── @cpattr ───────────────────────────────────────────────────────────────

function parseSrc(s: string): { objRef: string; attrGlob: string } {
  const i = s.indexOf("/");
  return i === -1 ? { objRef: "me", attrGlob: s } : { objRef: s.slice(0, i).trim(), attrGlob: s.slice(i + 1).trim() };
}

function parseDest(s: string): { objRef: string; newName?: string } {
  const i = s.indexOf("/");
  return i === -1 ? { objRef: s.trim() } : { objRef: s.slice(0, i).trim(), newName: s.slice(i + 1).trim() || undefined };
}

addCmd({
  name: "@cpattr",
  pattern: /^@cpattr(?:\/(\S+))?\s+(.*)/i,
  lock: "connected",
  category: "Building",
  help: `@cpattr[/<switches>] <obj>/<attr>=<dest>[/<newname>][,<dest2>[/<newname2>],...]

Copy attributes from one object to one or more destinations.
Both source and destination must be objects you control.
Wildcards (* and ?) are allowed in the attribute name.

Switches:
  /clear    Delete the source attribute after a successful copy.
  /verbose  Show each attribute copied (useful with wildcards).
  /verify   Reject destinations with invalid attribute names.

Examples:
  @cpattr me/DESC=box               Copy DESC from me to box.
  @cpattr me/DESC=box/ALTDESC       Copy me/DESC to box/ALTDESC.
  @cpattr/clear me/TEMP=archive     Move me/TEMP to archive/TEMP.
  @cpattr me/SKILL_*=puppet         Copy all SKILL_* attrs to puppet.`,
  exec: async (u: IUrsamuSDK) => {
    const swRaw = (u.cmd.args[0] ?? "").toLowerCase();
    const rest  = (u.cmd.args[1] ?? "").trim();
    const doClear   = swRaw.includes("clear");
    const doVerbose = swRaw.includes("verbose");
    const doVerify  = swRaw.includes("verify");

    const eqIdx = rest.indexOf("=");
    if (eqIdx === -1) return u.send("Usage: @cpattr[/switches] <obj>/<attr>=<dest>[/<newname>][,...]");
    const srcStr  = rest.slice(0, eqIdx).trim();
    const destStr = rest.slice(eqIdx + 1).trim();
    if (!srcStr || !destStr) return u.send("Usage: @cpattr[/switches] <obj>/<attr>=<dest>[/<newname>][,...]");

    const { objRef: srcRef, attrGlob } = parseSrc(srcStr);
    const srcResult = await u.util.target(u.me, srcRef, true);
    if (!srcResult) return u.send(`I can't find '${srcRef}'.`);
    if (!await u.canEdit(u.me, srcResult)) return u.send("Permission denied on source.");

    const srcObj = await Obj.get(srcResult.id);
    if (!srcObj) return u.send("Source object not found.");
    const srcAttrs: IAttribute[] = (srcObj.data?.attributes as IAttribute[] | undefined) ?? [];

    const _isStaff = isStaff(u.me.flags);
    const attrRe   = globToRegex(attrGlob);
    const matched  = srcAttrs.filter((a) => attrRe.test(a.name));
    if (matched.length === 0) return u.send(`No attributes matching '${attrGlob}' on ${srcObj.name}.`);

    const dests = destStr.split(",").map((s) => parseDest(s.trim())).filter((d) => d.objRef);
    let totalCopied = 0;
    const saves: Promise<void>[] = [];

    for (const { objRef: destRef, newName } of dests) {
      const destResult = await u.util.target(u.me, destRef, true);
      if (!destResult) { u.send(`I can't find destination '${destRef}'.`); continue; }
      if (!await u.canEdit(u.me, destResult)) { u.send(`Permission denied on '${destRef}'.`); continue; }

      const destObj = await Obj.get(destResult.id);
      if (!destObj) { u.send(`Destination object '${destRef}' not found.`); continue; }
      if (!destObj.dbobj.data) destObj.dbobj.data = { attributes: [] };
      const destAttrs: IAttribute[] = (destObj.data?.attributes as IAttribute[] | undefined) ?? [];

      for (const srcAttr of matched) {
        if (srcAttr.setter && srcAttr.setter !== u.me.id && !_isStaff) {
          if (doVerbose) u.send(`Skipped: ${srcObj.name}/${srcAttr.name} — set by another player.`);
          continue;
        }
        const targetName = matched.length === 1 && newName ? newName : (newName ?? srcAttr.name);
        if (doVerify && !/^[A-Z0-9_]+$/i.test(targetName)) {
          if (doVerbose) u.send(`Skipped: '${targetName}' is not a valid attribute name.`);
          continue;
        }
        const existingIdx = destAttrs.findIndex((a) => a.name.toLowerCase() === targetName.toLowerCase());
        const newAttr: IAttribute = { name: targetName.toUpperCase(), value: srcAttr.value, setter: u.me.id, type: srcAttr.type };
        if (existingIdx >= 0) destAttrs[existingIdx] = newAttr;
        else destAttrs.push(newAttr);
        if (doVerbose) u.send(`Copied: ${srcObj.name}/${srcAttr.name} → ${destObj.name}/${targetName.toUpperCase()}`);
        totalCopied++;
      }

      destObj.dbobj.data.attributes = destAttrs;
      saves.push(destObj.save());
    }

    await Promise.all(saves);

    if (doClear && totalCopied > 0) {
      srcObj.dbobj.data!.attributes = srcAttrs.filter((a) => !matched.some((m) => m.name === a.name));
      await srcObj.save();
      u.send(`Copied ${totalCopied} attribute${totalCopied === 1 ? "" : "s"} and cleared from source.`);
    } else {
      u.send(`Copied ${totalCopied} attribute${totalCopied === 1 ? "" : "s"}.`);
    }
  },
});

// ── @mvattr ───────────────────────────────────────────────────────────────

addCmd({
  name: "@mvattr",
  pattern: /^@mvattr\s+(.+?)=(.+)/i,
  lock: "connected",
  category: "Building",
  help: `@mvattr <object>=<old>,<new>[,<copy1>,<copy2>...]

Rename attribute <old> to <new> on <object>. Optionally copy to additional
names at the same time. You must control <object>.

Examples:
  @mvattr me=DESC,DESCRIPTION         Rename DESC → DESCRIPTION on yourself.
  @mvattr box=TEMP,BACKUP,ARCHIVE     Rename TEMP → BACKUP, also copy to ARCHIVE.`,
  exec: async (u: IUrsamuSDK) => {
    const objRef  = (u.cmd.args[0] ?? "").trim();
    const nameStr = (u.cmd.args[1] ?? "").trim();
    if (!objRef || !nameStr) return u.send("Usage: @mvattr <object>=<old>,<new>[,<copy>...]");

    const names = nameStr.split(",").map((s) => s.trim()).filter(Boolean);
    if (names.length < 2) return u.send("@mvattr requires at least <old>,<new>.");
    const [oldName, newName, ...extraCopies] = names;

    const result = await u.util.target(u.me, objRef, true);
    if (!result) return u.send(`I can't find '${objRef}'.`);
    if (!await u.canEdit(u.me, result)) return u.send("Permission denied.");

    const obj = await Obj.get(result.id);
    if (!obj) return u.send("Object not found.");
    if (!obj.dbobj.data) obj.dbobj.data = { attributes: [] };

    const attrs: IAttribute[] = (obj.data?.attributes as IAttribute[] | undefined) ?? [];
    const srcIdx = attrs.findIndex((a) => a.name.toLowerCase() === oldName.toLowerCase());
    if (srcIdx === -1) return u.send(`Attribute '${oldName}' not found on ${obj.name}.`);

    const srcAttr = attrs[srcIdx];
    const staff = isStaff(u.me.flags);
    if (srcAttr.setter && srcAttr.setter !== u.me.id && !staff) {
      return u.send(`Permission denied. Attribute '${oldName.toUpperCase()}' was set by another player.`);
    }
    const canModify = !srcAttr.setter || srcAttr.setter === u.me.id || staff;

    const upsert = (name: string) => {
      const upper = name.toUpperCase();
      const i = attrs.findIndex((a) => a.name.toLowerCase() === upper.toLowerCase());
      const entry: IAttribute = { name: upper, value: srcAttr.value, setter: u.me.id, type: srcAttr.type };
      if (i >= 0) attrs[i] = entry; else attrs.push(entry);
    };

    upsert(newName);
    for (const extra of extraCopies) upsert(extra);

    if (canModify) {
      attrs.splice(srcIdx, 1);
      u.send(`Renamed ${obj.name}/${oldName.toUpperCase()} → ${newName.toUpperCase()}${extraCopies.length ? ` (+${extraCopies.length} copies)` : ""}.`);
    } else {
      u.send(`Cannot modify '${oldName}' (owned by another). Copied to ${newName.toUpperCase()}${extraCopies.length ? ` and ${extraCopies.length} more` : ""} without removing original.`);
    }

    obj.dbobj.data!.attributes = attrs;
    await obj.save();
  },
});

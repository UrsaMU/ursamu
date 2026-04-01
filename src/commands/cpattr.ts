import { addCmd } from "../services/commands/index.ts";
import { dbojs } from "../services/Database/index.ts";
import { Obj } from "../services/DBObjs/index.ts";
import { canEdit, target } from "../utils/index.ts";
import { send } from "../services/broadcast/index.ts";
import type { IAttribute } from "../@types/IAttribute.ts";
import type { IDBOBJ } from "../@types/IDBObj.ts";
import type { IUrsamuSDK } from "../@types/UrsamuSDK.ts";

function globToRegex(pat: string): RegExp {
  const escaped = pat.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`, "i");
}

/** Parse "obj/attr" → { objRef, attrGlob } */
function parseSrc(s: string): { objRef: string; attrGlob: string } {
  const i = s.indexOf("/");
  if (i === -1) return { objRef: "me", attrGlob: s };
  return { objRef: s.slice(0, i).trim(), attrGlob: s.slice(i + 1).trim() };
}

/** Parse "obj[/newname]" → { objRef, newName? } */
function parseDest(s: string): { objRef: string; newName?: string } {
  const i = s.indexOf("/");
  if (i === -1) return { objRef: s.trim() };
  return { objRef: s.slice(0, i).trim(), newName: s.slice(i + 1).trim() || undefined };
}

export default () =>
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
  /verify   Reject destinations with invalid attribute names instead of
            falling back to the source attribute name.

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

      const en = await dbojs.queryOne({ id: u.me.id });
      if (!en) return;

      const srcResult = await target(en as unknown as IDBOBJ, srcRef);
      if (!srcResult) return send([u.socketId ?? ""], `I can't find '${srcRef}'.`);
      if (!await canEdit(en as unknown as IDBOBJ, srcResult)) return u.send("Permission denied on source.");

      const srcObj = await Obj.get(srcResult.id);
      if (!srcObj) return u.send("Source object not found.");
      const srcAttrs: IAttribute[] = (srcObj.data?.attributes as IAttribute[] | undefined) ?? [];

      // Match source attributes by glob
      const attrRe   = globToRegex(attrGlob);
      const matched  = srcAttrs.filter(a => attrRe.test(a.name));
      if (matched.length === 0) return u.send(`No attributes matching '${attrGlob}' on ${srcObj.name}.`);

      // Parse comma-separated destinations
      const dests = destStr.split(",").map(s => parseDest(s.trim())).filter(d => d.objRef);

      let totalCopied = 0;

      for (const { objRef: destRef, newName } of dests) {
        const destResult = await target(en as unknown as IDBOBJ, destRef);
        if (!destResult) { u.send(`I can't find destination '${destRef}'.`); continue; }
        if (!await canEdit(en as unknown as IDBOBJ, destResult)) { u.send(`Permission denied on '${destRef}'.`); continue; }

        const destObj = await Obj.get(destResult.id);
        if (!destObj) { u.send(`Destination object '${destRef}' not found.`); continue; }

        if (!destObj.dbobj.data) destObj.dbobj.data = { attributes: [] };
        const destAttrs: IAttribute[] = (destObj.data?.attributes as IAttribute[] | undefined) ?? [];

        for (const srcAttr of matched) {
          const targetName = matched.length === 1 && newName ? newName : (newName ?? srcAttr.name);

          // /verify: skip if destination attr name would be invalid
          if (doVerify && !/^[A-Z0-9_]+$/i.test(targetName)) {
            if (doVerbose) u.send(`Skipped: '${targetName}' is not a valid attribute name.`);
            continue;
          }

          const existingIdx = destAttrs.findIndex(a => a.name.toLowerCase() === targetName.toLowerCase());
          const newAttr: IAttribute = { name: targetName.toUpperCase(), value: srcAttr.value, setter: u.me.id, type: srcAttr.type };

          if (existingIdx >= 0) destAttrs[existingIdx] = newAttr;
          else destAttrs.push(newAttr);

          if (doVerbose) u.send(`Copied: ${srcObj.name}/${srcAttr.name} → ${destObj.name}/${targetName.toUpperCase()}`);
          totalCopied++;
        }

        destObj.dbobj.data.attributes = destAttrs;
        await destObj.save();
      }

      if (doClear && totalCopied > 0) {
        const remaining = srcAttrs.filter(a => !matched.some(m => m.name === a.name));
        srcObj.dbobj.data!.attributes = remaining;
        await srcObj.save();
        u.send(`Copied ${totalCopied} attribute${totalCopied === 1 ? "" : "s"} and cleared from source.`);
      } else {
        u.send(`Copied ${totalCopied} attribute${totalCopied === 1 ? "" : "s"}.`);
      }
    },
  });

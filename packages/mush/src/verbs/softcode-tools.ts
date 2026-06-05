import { addCmd } from "../commands/addCmd.ts";
import type { IUrsamuSDK } from "../commands/types.ts";
import { Obj } from "../world/dbobjs.ts";
import type { IAttribute } from "../world/types.ts";

// ── Shared helpers ────────────────────────────────────────────────────────

export function globToRegex(pat: string): RegExp {
  const escaped = pat.replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`, "i");
}

// ── @grep ─────────────────────────────────────────────────────────────────

const MAX_PARENT_DEPTH = 50;

function isReDoSProne(pattern: string): boolean {
  return /\([^)]*[+*?][^)]*\)[+*?{]/.test(pattern) || pattern.length > 200;
}

async function collectWithParents(
  obj: InstanceType<typeof Obj> | null,
  visited = new Set<string>(),
  depth = 0,
): Promise<Array<{ objName: string; objId: string; attrs: IAttribute[] }>> {
  if (!obj || visited.has(obj.id) || depth > MAX_PARENT_DEPTH) return [];
  visited.add(obj.id);
  const attrs: IAttribute[] = (obj.data?.attributes as IAttribute[] | undefined) ?? [];
  const results: Array<{ objName: string; objId: string; attrs: IAttribute[] }> = [
    { objName: obj.name ?? obj.id, objId: obj.id, attrs },
  ];
  const parentId = obj.data?.parent as string | undefined;
  if (parentId) {
    const parent = await Obj.get(parentId);
    if (parent) results.push(...await collectWithParents(parent, visited, depth + 1));
  }
  return results;
}

addCmd({
  name: "@grep",
  pattern: /^@grep(?:\/(\S+))?\s+(.*)/i,
  lock: "connected",
  category: "Building",
  help: `@grep[/<switches>] <object>=<attrglob>,<string>

Search the attributes of <object> whose names match <attrglob> for <string>.
Wildcards (* and ?) are allowed in <attrglob>. Outputs matching attr names.

Switches:
  /quiet    Suppress the "Grep: Done." footer.
  /regexp   Treat <string> as a regular expression.
  /parent   Also search down the parent chain.

Examples:
  @grep me=*,hello            Find attrs on me containing "hello".
  @grep/regexp me=*,^say      Find attrs on me whose value starts with "say".`,
  exec: async (u: IUrsamuSDK) => {
    const swRaw = (u.cmd.args[0] ?? "").toLowerCase();
    const rest  = (u.cmd.args[1] ?? "").trim();
    const doQuiet  = swRaw.includes("quiet");
    const doRegexp = swRaw.includes("regexp");
    const doParent = swRaw.includes("parent");

    const eqIdx = rest.indexOf("=");
    if (eqIdx === -1) return u.send("Usage: @grep[/switches] <object>=<attrglob>,<string>");
    const objRef    = rest.slice(0, eqIdx).trim();
    const afterEq   = rest.slice(eqIdx + 1);
    const commaIdx  = afterEq.indexOf(",");
    if (commaIdx === -1) return u.send("Usage: @grep[/switches] <object>=<attrglob>,<string>");
    const attrGlob  = afterEq.slice(0, commaIdx).trim() || "*";
    const searchStr = afterEq.slice(commaIdx + 1);
    if (!searchStr) return u.send("Search string cannot be empty.");

    const result = await u.util.target(u.me, objRef, true);
    if (!result) return u.send(`I can't find '${objRef}'.`);
    if (!await u.canEdit(u.me, result)) return u.send("Permission denied.");

    const obj = await Obj.get(result.id);
    if (!obj) return u.send("Object not found.");

    const attrRe = globToRegex(attrGlob);
    let valueRe: RegExp;
    try {
      if (doRegexp) {
        if (isReDoSProne(searchStr)) return u.send(`Unsafe regular expression: ${searchStr}`);
        valueRe = new RegExp(searchStr, "i");
      } else {
        valueRe = new RegExp(searchStr.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      }
    } catch (e: unknown) {
      void e;
      return u.send(`Invalid regular expression: ${searchStr}`);
    }

    const sources = doParent
      ? await collectWithParents(obj)
      : [{ objName: obj.name ?? obj.id, objId: obj.id, attrs: (obj.data?.attributes as IAttribute[] | undefined) ?? [] }];

    let found = 0;
    for (const { objName, objId, attrs } of sources) {
      const hdr = doParent ? `${objName}(#${objId})` : null;
      const hits = attrs.filter((a) => attrRe.test(a.name) && valueRe.test(a.value));
      if (hits.length === 0) continue;
      if (hdr) u.send(`%ch${hdr}:%cn`);
      for (const a of hits) { u.send(`  ${a.name.toUpperCase()}`); found++; }
    }

    if (found === 0) u.send("No matching attributes found.");
    if (!doQuiet) u.send("Grep: Done.");
  },
});

// ── @include ─────────────────────────────────────────────────────────────

const SYSTEM_ATTRS = new Set([
  "name", "password", "owner", "lock", "locks", "home",
  "parent", "zone", "moniker", "lastLogout", "termWidth",
  "quota", "money", "channels",
]);

addCmd({
  name: "@include",
  pattern: /^@include\s+([^=]+)=([^/\r\n]+)(?:\/(.+))?/i,
  lock: "connected builder+",
  category: "Building",
  help: `@include <dest>=<source>[/<glob>]  — Copy attributes from source to destination.

  <dest>    Object to copy attributes into.
  <source>  Object to copy attributes from.
  <glob>    Optional glob pattern to filter which attrs to copy (default: *).

Examples:
  @include myobj=template          Copy all attrs from 'template' to 'myobj'.
  @include myobj=template/DESC*    Copy only DESC* attrs from 'template'.`,
  exec: async (u: IUrsamuSDK) => {
    const destArg = (u.cmd.args[0] ?? "").trim();
    const srcArg  = (u.cmd.args[1] ?? "").trim();
    const globPat = ((u.cmd.args[2] ?? "").trim()) || "*";
    if (!destArg || !srcArg) { u.send("Usage: @include <dest>=<source>[/<glob>]"); return; }

    const srcResult  = await u.util.target(u.me, srcArg, true);
    const destResult = await u.util.target(u.me, destArg, true);
    if (!srcResult)  { u.send(`Source '${srcArg}' not found.`);       return; }
    if (!destResult) { u.send(`Destination '${destArg}' not found.`); return; }
    if (!await u.canEdit(u.me, srcResult))  { u.send("Permission denied on source.");      return; }
    if (!await u.canEdit(u.me, destResult)) { u.send("Permission denied on destination."); return; }

    const srcObj  = await Obj.get(srcResult.id);
    const destObj = await Obj.get(destResult.id);
    if (!srcObj)  { u.send("Source object not found.");      return; }
    if (!destObj) { u.send("Destination object not found."); return; }

    const re = globToRegex(globPat);
    const srcAttrs: IAttribute[]  = (srcObj.data?.attributes  as IAttribute[] | undefined) ?? [];
    if (!destObj.dbobj.data) destObj.dbobj.data = { attributes: [] };
    const destAttrs: IAttribute[] = (destObj.data?.attributes as IAttribute[] | undefined) ?? [];

    let count = 0;
    for (const attr of srcAttrs) {
      if (SYSTEM_ATTRS.has(attr.name.toLowerCase())) continue;
      if (!re.test(attr.name.toUpperCase())) continue;
      const existingIdx = destAttrs.findIndex((a) => a.name.toLowerCase() === attr.name.toLowerCase());
      const newAttr: IAttribute = { name: attr.name.toUpperCase(), value: attr.value, setter: u.me.id, type: attr.type };
      if (existingIdx >= 0) destAttrs[existingIdx] = newAttr;
      else destAttrs.push(newAttr);
      count++;
    }

    destObj.dbobj.data.attributes = destAttrs;
    await destObj.save();
    u.send(`${count} attribute${count === 1 ? "" : "s"} copied from ${srcObj.name} to ${destObj.name}.`);
  },
});

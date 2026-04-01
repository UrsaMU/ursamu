import { addCmd } from "../services/commands/index.ts";
import { Obj } from "../services/DBObjs/index.ts";
import { canEdit, target } from "../utils/index.ts";
import { send } from "../services/broadcast/index.ts";
import { dbojs } from "../services/Database/index.ts";
import type { IAttribute } from "../@types/IAttribute.ts";
import type { IDBOBJ } from "../@types/IDBObj.ts";
import type { IUrsamuSDK } from "../@types/UrsamuSDK.ts";

function globToRegex(pat: string): RegExp {
  const escaped = pat.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`, "i");
}

/**
 * Returns true if a user-supplied regex pattern is likely to cause
 * catastrophic backtracking (ReDoS). Detects nested quantifier groups
 * such as (a+)+, (a*)*, (a+)* etc., and rejects patterns that are
 * excessively long.
 */
function isReDoSProne(pattern: string): boolean {
  // Nested quantifier: a group containing a quantifier followed immediately
  // by another quantifier — classic catastrophic backtracking.
  return /\([^)]*[+*?][^)]*\)[+*?{]/.test(pattern) || pattern.length > 200;
}

/** Maximum parent chain depth for @grep /parent to prevent slow-DoS. */
const MAX_PARENT_DEPTH = 50;

/** Walk the parent chain of an object, collecting unique attribute lists.
 *  Stops after MAX_PARENT_DEPTH hops to prevent O(n) DoS via deep chains. */
async function collectWithParents(
  obj: Awaited<ReturnType<typeof Obj.get>>,
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

export default () =>
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
  @grep box=DESC*,sword       Find DESC* attrs on box containing "sword".
  @grep/regexp me=*,^say      Find attrs on me whose value starts with "say".
  @grep/parent me=*,attack    Search me and all parents for "attack".`,
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

      const en = await dbojs.queryOne({ id: u.me.id });
      if (!en) return;

      const result = await target(en as unknown as IDBOBJ, objRef);
      if (!result) return send([u.socketId ?? ""], `I can't find '${objRef}'.`);
      if (!await canEdit(en as unknown as IDBOBJ, result)) return u.send("Permission denied.");

      const obj = await Obj.get(result.id);
      if (!obj) return u.send("Object not found.");

      // Build matchers — compile once for efficiency
      const attrRe   = globToRegex(attrGlob);
      let valueRe: RegExp;
      try {
        if (doRegexp) {
          if (isReDoSProne(searchStr)) {
            return u.send(`Unsafe regular expression (nested quantifiers or excessive length): ${searchStr}`);
          }
          valueRe = new RegExp(searchStr, "i");
        } else {
          valueRe = new RegExp(searchStr.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
        }
      } catch {
        return u.send(`Invalid regular expression: ${searchStr}`);
      }

      const sources = doParent ? await collectWithParents(obj) : [{ objName: obj.name ?? obj.id, objId: obj.id, attrs: (obj.data?.attributes as IAttribute[] | undefined) ?? [] }];

      let found = 0;
      for (const { objName, objId, attrs } of sources) {
        const header = doParent ? `${objName}(#${objId})` : null;
        const hits = attrs.filter(a => attrRe.test(a.name) && valueRe.test(a.value));
        if (hits.length === 0) continue;
        if (header) u.send(`%ch${header}:%cn`);
        for (const a of hits) {
          u.send(`  ${a.name.toUpperCase()}`);
          found++;
        }
      }

      if (found === 0) u.send(`No matching attributes found.`);
      if (!doQuiet) u.send("Grep: Done.");
    },
  });

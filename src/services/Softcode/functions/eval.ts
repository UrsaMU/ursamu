import { registerFunction } from "./registry.ts";
import { parser } from "../parser.ts";
import { target } from "../../../utils/target.ts";
import { getAttribute } from "../../../utils/getAttribute.ts";
import type { IParserContext } from "../types.ts";
import type { IDBOBJ } from "../../../@types/IDBObj.ts";

const getEnactor = (data: Record<string, unknown>): IDBOBJ | undefined => {
  return data.enactor as IDBOBJ;
};

registerFunction("u", async (args: string[], data: Record<string, unknown>, ctx?: IParserContext) => {
    // u(obj/attr, arg0...arg9)
    if (!ctx) return "#-1 NO CONTEXT";
    const enactor = getEnactor(data);
    if (!enactor) return "#-1 NO ENACTOR";

    const rawTar = args[0];
    const slashIdx = rawTar.indexOf("/");
    
    let obj: IDBOBJ | undefined | false;
    let attrName = "";

    if (slashIdx !== -1) {
        const objName = rawTar.slice(0, slashIdx);
        attrName = rawTar.slice(slashIdx + 1);
        obj = await target(enactor, objName, true);
    } else {
        obj = enactor;
        attrName = rawTar;
    }

    if (!obj) return "#-1 NO MATCH";
    
    const attr = await getAttribute(obj, attrName);
    if (!attr) return ""; // Or empty string if not found, standard MUX behavior

    // Setup new args
    // args[0] is the attr ref. args[1]..args[10] are %0..%9
    const newArgs = args.slice(1);
    
    // Evaluate
    // We need to pass the *same* registers? Or new? 
    // u() usually inherits registers but overrides args.
    // MUX: "The registers are preserved across the call."
    
    return await parser(attr.value, {
        ...ctx,
        args: newArgs,
        // Preserve other context
    });
});

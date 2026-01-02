import { parser } from "../services/Softcode/parser.ts";
import type { IDBOBJ } from "../@types/IDBObj.ts";
import { displayName } from "./displayName.ts";

export interface IFormatData extends Record<string, unknown> {
  enactor?: IDBOBJ;
  target?: IDBOBJ;
  args?: string[];
}

export const evaluateFormat = async (
  format: string,
  data: IFormatData
): Promise<string> => {
  if (!format) return "";

  // Basic %-substitutions
  let processed = format;
  
  // Replace arguments %0-%9
  if (data.args) {
      data.args.forEach((arg, index) => {
          if (index > 9) return;
          processed = processed.replaceAll(`%${index}`, arg);
      });
  }

  if (data.enactor) {
    const name = displayName(data.enactor, data.enactor, true) || "";
    const dbref = `#${data.enactor.id}`;
    processed = processed.replaceAll(/%n/gi, name);
    processed = processed.replaceAll(/%#/g, dbref);
    processed = processed.replaceAll(/%l/gi, `#${data.enactor.location || "0"}`);
    processed = processed.replaceAll(/%N/g, name); // already capped usually, but we could force it

    // Pronouns
    const gender = (data.enactor?.data?.sex as string || "neutral").toLowerCase();
    
    // Subjective: %s (he, she, it, they)
    processed = processed.replaceAll(/%s/g, 
        gender === "male" ? "he" : 
        gender === "female" ? "she" : 
        gender === "plural" ? "they" : "it"
    );
     processed = processed.replaceAll(/%S/g, 
        gender === "male" ? "He" : 
        gender === "female" ? "She" : 
        gender === "plural" ? "They" : "It"
    );

    // Objective: %o (him, her, it, them)
    processed = processed.replaceAll(/%o/g, 
        gender === "male" ? "him" : 
        gender === "female" ? "her" : 
        gender === "plural" ? "them" : "it"
    );
    processed = processed.replaceAll(/%O/g, 
        gender === "male" ? "Him" : 
        gender === "female" ? "Her" : 
        gender === "plural" ? "Them" : "It"
    );

    // Possessive: %p (his, her, its, their)
    processed = processed.replaceAll(/%p/g, 
        gender === "male" ? "his" : 
        gender === "female" ? "her" : 
        gender === "plural" ? "their" : "its"
    );
    processed = processed.replaceAll(/%P/g, 
        gender === "male" ? "His" : 
        gender === "female" ? "Her" : 
        gender === "plural" ? "Their" : "Its"
    );

    // Absolute Possessive: %a (his, hers, its, theirs)
    processed = processed.replaceAll(/%a/g, 
        gender === "male" ? "his" : 
        gender === "female" ? "hers" : 
        gender === "plural" ? "theirs" : "its"
    );
    processed = processed.replaceAll(/%A/g, 
        gender === "male" ? "His" : 
        gender === "female" ? "Hers" : 
        gender === "plural" ? "Theirs" : "Its"
    );
  }

  if (data.target) {
    processed = processed.replaceAll(/%!/g, `#${data.target.id}`);
  }

  // Common whitespace/escapes
  processed = processed.replaceAll(/%r/gi, "\n");
  processed = processed.replaceAll(/%t/gi, "\t");
  processed = processed.replaceAll(/%%/g, "%"); // Escaped percent

  // Pass through the softcode parser
  return await parser(processed, data);
};

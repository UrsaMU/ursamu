import { IUrsamuSDK } from "../../src/@types/UrsamuSDK.ts";

/**
 * @switch[/first] <value>=<case1>,<cmd1>[,<case2>,<cmd2>,...][,<default>]
 *
 * Evaluates each case in order. If <value> matches a case, the paired command
 * is executed. With /first, stops after the first match. If the number of
 * remaining items is odd (no pair), it is treated as the default command.
 *
 * Matching is case-insensitive string equality unless the case is a bare
 * integer, in which case numeric equality is used.
 *
 * Examples:
 *   @switch %0=yes,say Okay!,no,say Nope!,say Huh?
 *   @switch/first 3=1,+1 hit,2,+2 hits,3,+3 hits
 */
export default (u: IUrsamuSDK) => {
  const first = (u.cmd.switches || []).includes("first");
  const raw = (u.cmd.args[0] || "").trim();
  if (!raw) { u.send("Usage: @switch[/first] <value>=<case1>,<cmd1>,..."); return; }

  const eqIdx = raw.indexOf("=");
  if (eqIdx === -1) { u.send("Usage: @switch[/first] <value>=<case1>,<cmd1>,..."); return; }

  const value   = raw.slice(0, eqIdx).trim();
  const rest    = raw.slice(eqIdx + 1);

  // Split on commas not inside brackets/parens — simple split for now
  const parts = rest.split(",").map(p => p.trim());

  let matched = false;
  let i = 0;
  while (i < parts.length) {
    if (i + 1 >= parts.length) {
      // Odd item out — default command
      if (!matched || !first) {
        u.execute(parts[i]);
      }
      break;
    }
    const caseVal = parts[i];
    const caseCmd = parts[i + 1];
    i += 2;

    const isMatch = caseVal.toLowerCase() === value.toLowerCase() ||
                    (caseVal === String(Number(caseVal)) && Number(caseVal) === Number(value));
    if (isMatch) {
      u.execute(caseCmd);
      matched = true;
      if (first) break;
    }
  }
};

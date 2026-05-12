// deno-lint-ignore-file require-await
import { addCmd } from "../services/commands/index.ts";
import { send } from "../services/broadcast/index.ts";
import type { IUrsamuSDK } from "../@types/UrsamuSDK.ts";

/**
 * @assert <condition>[=<message>]
 *
 * A soft guard used inside @dolist / @while / @switch chains.
 * If <condition> evaluates to a falsy value (empty string, "0", or "false"),
 * the optional <message> is sent to the enactor.  On success the command is
 * silent.  In native context the literal condition string is inspected; when
 * called from softcode the argument will already be an evaluated string.
 */
addCmd({
    name: "@assert",
    pattern: /^@assert\s+(.*?)(?:\s*=\s*(.*))?$/i,
    lock: "connected",
    category: "Scripting",
    help: `@assert <condition>[=<message>]  — Halt if condition is false.

  Evaluates <condition>; if 0 or empty, sends optional <message> and stops.
  Primarily used inside @dolist or @while to abort on bad input.

Examples:
  @assert [isnum(%0)]=Bad: %0 is not a number.
  @assert [gt(%0,0)]=Value must be positive.`,
    exec: async (u: IUrsamuSDK) => {
      const condition = (u.cmd.args[0] ?? "").trim();
      const message   = (u.cmd.args[1] ?? "").trim();

      // Treat empty string, "0", and "false" as falsy.
      const fails = !condition ||
        condition === "0" ||
        condition.toLowerCase() === "false";

      if (fails && message) {
        send([u.socketId ?? ""], message);
      }
      // @assert is silent on success.
    },
  });

import { addCmd } from "../commands/addCmd.ts";
import type { IUrsamuSDK } from "../commands/types.ts";
import { send } from "@ursamu/core";
import { getQuickJS } from "quickjs-emscripten";

export async function execJs(u: IUrsamuSDK): Promise<void> {
  const code = u.cmd.args[0];
  try {
    const QuickJS = await getQuickJS();
    const vm = QuickJS.newContext();

    const start = Date.now();
    vm.runtime.setInterruptHandler(() => Date.now() - start > 50);
    vm.runtime.setMemoryLimit(1024 * 1024);

    const result = vm.evalCode(code);

    if (result.error) {
      const error = vm.dump(result.error);
      result.error.dispose();
      throw new Error(error.message || String(error));
    }

    const value = vm.dump(result.value);
    result.value.dispose();
    vm.dispose();

    send([u.socketId || ""], `${value}`);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    send([u.socketId || ""], `%ch%ch%crError>%cn ${msg}%cn`);
  }
}

addCmd({
  name: "js",
  pattern: /^[+@]?js\s+(.*)/i,
  lock: "connected & admin+",
  category: "Admin",
  help: `js <code>  — Evaluate JavaScript code in a sandboxed QuickJS VM.

Admin only. 50ms timeout, 1 MB memory limit.

Examples:
  js 1 + 1
  js JSON.stringify({a:1})`,
  exec: execJs,
});

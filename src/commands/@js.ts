import { getQuickJS } from "../../deps.ts";
import { addCmd, send } from "../services/index.ts";
import type { IUrsamuSDK } from "../@types/UrsamuSDK.ts";

export default () =>
  addCmd({
    name: "js",
    pattern: /^[+@]?js\s+(.*)/i,
    lock: "connected & admin+",
    exec: async (u: IUrsamuSDK) => {
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
    },
  });

import { getQuickJS } from "../../deps.ts";
import { addCmd, send } from "../services/index.ts";

export default () =>
  addCmd({
    name: "js",
    pattern: /^[+@]?js\s+(.*)/i,
    lock: "connected admin+",
    exec: async (ctx, [code]) => {
      try {
        const QuickJS = await getQuickJS();
        const vm = QuickJS.newContext();

        // 50ms timeout
        const start = Date.now();
        vm.runtime.setInterruptHandler(() => {
          return Date.now() - start > 50;
        });

        // Memory limit - 1MB
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

        send([ctx.socket.id], `${value}`);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        send([ctx.socket.id], `%ch%ch%crError>%cn ${msg}%cn`);
      }
    },
  });

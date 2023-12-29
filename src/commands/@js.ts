import { VM } from "../../deps.ts";
import { addCmd, send } from "../services/index.ts";
import { center, ljust, rjust } from "../utils/format.ts";
export default () =>
  addCmd({
    name: "js",
    pattern: /^[+@]?js\s+(.*)/i,
    lock: "connected admin+",
    exec: async (ctx, [code]) => {
      const vm = new VM({
        timeout: 5000,
        sandbox: { ljust, rjust, center },
      });

      try {
        const result = await vm.run(code);
        console.log(result);
        send([ctx.socket.id], `${result}`);
      } catch (e: any) {
        send([ctx.socket.id], `%ch%ch%crError>%cn ${e.message}%cn`);
      }
    },
  });

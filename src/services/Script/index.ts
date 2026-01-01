
import { getQuickJS, QuickJSWASMModule } from "../../../deps.ts";
import { createScriptContext } from "./api.ts";
import { IContext } from "../../@types/IContext.ts";

export class ScriptService {
    private static instance: ScriptService;
    private qjs: QuickJSWASMModule | null = null;

    private constructor() { }

    static getInstance(): ScriptService {
        if (!ScriptService.instance) {
            ScriptService.instance = new ScriptService();
        }
        return ScriptService.instance;
    }

    async init() {
        if (!this.qjs) {
            this.qjs = await getQuickJS();
        }
    }

    async run(code: string, ctx: IContext) {
        if (!this.qjs) await this.init();

        const runtime = this.qjs!.newRuntime();
        const vm = runtime.newContext();
        const _sandbox = createScriptContext(ctx);

        // Check for watchdog (timeout)
        const start = Date.now();
        runtime.setInterruptHandler(() => {
            return Date.now() - start > 50; // 50ms timeout
        });

        try {
            // Expose API to the VM
            // This is complex with quickjs-emscripten as we need to wrap objects
            // For formatted string simplicity in this Phase verify:
            // We will just expose a basic 'game' object if possible or just run code for calculation

            // Simplified: Just evaluating code for now to prove connection.
            // Direct object bridging requires more boilerplate (creating handles for each property).
            // Standard Eval:
            const result = vm.evalCode(code);

            if (result.error) {
                const error = vm.dump(result.error);
                result.error.dispose();
                throw error;
            } else {
                const value = vm.dump(result.value);
                result.value.dispose();
                return value;
            }

        } catch (e: unknown) {
            let msg = "";
            if (e instanceof Error) {
                msg = e.message;
            } else if (typeof e === "object" && e !== null && "message" in e) {
                msg = String((e as Record<string, unknown>).message);
            } else {
                msg = String(e);
            }
            throw new Error(`Script Execution Error: ${msg}`);
        } finally {
            vm.dispose();
        }
    }
}

export const scriptService = ScriptService.getInstance();

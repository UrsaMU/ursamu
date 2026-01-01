
import { assertEquals, assertRejects } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { scriptService } from "../src/services/Script/index.ts";
import { IContext } from "../src/@types/IContext.ts";

Deno.test("Script Service Tests", async (t) => {
    const mockCtx: IContext = {
        socket: { cid: "123", id: "mock-socket" } as any,
        msg: "",
        data: {}
    };

    await t.step("Basic Arithmetic", async () => {
        const result = await scriptService.run("1 + 1", mockCtx);
        assertEquals(result, 2);
    });

    await t.step("String Concatenation", async () => {
        const result = await scriptService.run("'Hello ' + 'World'", mockCtx);
        assertEquals(result, "Hello World");
    });

    await t.step("Timeout Watchdog", async () => {
        // This script should loop forever and trigger the interrupt handler
        const infiniteLoop = "while(true) {}";
        await assertRejects(
            async () => {
                await scriptService.run(infiniteLoop, mockCtx);
            },
            Error,
            "interrupted" // QuickJS throws "interrupted" on interrupt
        );
    });

    await t.step("Syntax Error", async () => {
        await assertRejects(
            async () => {
                await scriptService.run("var x =", mockCtx);
            }
        );
    });
});


import { assertEquals, assertRejects } from "@std/assert";
import { scriptService } from "../src/services/Script/index.ts";
import type { IContext } from "../src/@types/IContext.ts";
import type { IMSocket } from "../src/@types/IMSocket.ts";

Deno.test("Script Service Tests", async (t) => {
    const mockCtx: IContext = {
        socket: { cid: "123", id: "mock-socket" } as unknown as IMSocket,
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

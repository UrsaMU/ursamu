import { assertEquals } from "@std/assert";
import helpScript from "../system/scripts/help.ts";

Deno.test({
    name: "Help Script",
    sanitizeResources: false,
    sanitizeOps: false,
    fn: async (t: Deno.TestContext) => {
    
    await t.step("help list verification", async () => {
        let output = "";
        const u = {
            me: { id: "1", flags: new Set(["connected"]), state: {} },
            cmd: { args: [] },
            util: { target: () => Promise.resolve(undefined) },
            send: (msg: string) => {
                output += msg;
            },
            force: () => {}
        } as any;
        
        await helpScript(u);
        
        // Verify output contains MAIL topic (normalized from help_@mail.md or mail.ts)
        if (!output.includes("MAIL")) throw new Error("MAIL topic not found");
        
        // Verify output does NOT contain normalized prefixes
        if (output.includes("HELP_@MAIL")) throw new Error("HELP_@MAIL should be normalized to MAIL");
        if (output.includes("@MAIL")) throw new Error("@MAIL should be normalized to MAIL");
    });
    
    await t.step("help hierarchical verification", async () => {
        let output = "";
        const u = {
            me: { id: "1", flags: new Set(["connected"]), state: {} },
            cmd: { args: ["mail"] },
            util: { target: () => Promise.resolve(undefined) },
            send: (msg: string) => {
                output += msg;
            },
            force: () => {}
        } as any;
        
        await helpScript(u);
        
        // Verify output contains MAIL topic content (from index.md)
        if (!output.includes("MAIL")) throw new Error("MAIL topic header not found");
        if (!output.includes("SUB-TOPICS")) throw new Error("SUB-TOPICS section not found");
        
        // Verify subtopics are listed
        if (!output.includes("SEND")) throw new Error("SEND subtopic not found");
    });

    await t.step("help global lookup verification", async () => {
        let output = "";
        const u = {
            me: { id: "1", flags: new Set(["connected"]), state: {} },
            cmd: { args: ["send"] }, // Should find mail/send.md
            util: { target: () => Promise.resolve(undefined) },
            send: (msg: string) => {
                output += msg;
            },
            force: () => {}
        } as any;
        
        await helpScript(u);
        if (!output.includes("SEND")) throw new Error("SEND header not found via global lookup");
    });
    
    await t.step("help category verification", async () => {
        let output = "";
        const u = {
            me: { id: "1", flags: new Set(["connected"]), state: {} },
            cmd: { args: [] }, // Main index
            util: { target: () => Promise.resolve(undefined) },
            send: (msg: string) => {
                output += msg;
            },
            force: () => {}
        } as any;
        
        await helpScript(u);
        if (!output.includes("BUILDING")) throw new Error("BUILDING category not found");
        if (!output.includes("COMSYS")) throw new Error("COMSYS category not found");
    });
    },
});

import { assertEquals } from "@std/assert";
import { parser } from "../src/services/Softcode/parser.ts";

Deno.test("Softcode Parser - Basic Text", async () => {
    const input = "Hello World";
    const result = await parser(input);
    assertEquals(result, "Hello World");
});

Deno.test("Softcode Parser - Simple Function", async () => {
    const input = "[add(1, 2)]";
    const result = await parser(input);
    assertEquals(result, "3");
});

Deno.test("Softcode Parser - Nested Function", async () => {
    const input = "[add(1, [add(2, 3)])]";
    const result = await parser(input);
    assertEquals(result, "6");
});

Deno.test("Softcode Parser - Math Functions", async () => {
    assertEquals(await parser("[sub(10, 4)]"), "6");
    assertEquals(await parser("[mul(3, 4)]"), "12");
    assertEquals(await parser("[div(10, 2)]"), "5");
    assertEquals(await parser("[div(10, 0)]"), "#-1 DIVISION BY ZERO");
});

Deno.test("Softcode Parser - String Functions", async () => {
    assertEquals(await parser("[cat(Hello, World)]"), "HelloWorld");
    assertEquals(await parser("[cat(Hello,  , World)]"), "HelloWorld"); // Args are trimmed
    assertEquals(await parser("[cat(Hello, [ ], World)]"), "Hello World"); // [ ] preserves space
    assertEquals(await parser("[ucase(foo)]"), "FOO");
    assertEquals(await parser("[lcase(FOO)]"), "foo");
});

Deno.test("Softcode Parser - Mixed Content", async () => {
    const input = "The answer is [add(40, 2)].";
    const result = await parser(input);
    assertEquals(result, "The answer is 42.");
});

Deno.test("Softcode Parser - Unbalanced Brackets", async () => {
    const input = "This is [broken";
    const result = await parser(input);
    assertEquals(result, "This is [broken");
});

import { dbojs } from "../src/services/Database/index.ts";
import { DBO } from "../src/services/Database/database.ts";
// deno-lint-ignore no-unused-vars
import type { IDBOBJ } from "../src/@types/IDBObj.ts";

// Mock Deno.KV
const kv = await Deno.openKv(":memory:");
Deno.openKv = () => Promise.resolve(kv);
// deno-lint-ignore no-explicit-any
(DBO as any).kv = null;

Deno.test("Softcode Parser - DB Functions (Real DB Mock)", async (t) => {
    // Seed DB
    await dbojs.clear(); // Clear any previous state
    const enactor = await dbojs.create({
        id: "1",
        flags: "player connected superuser", // Superuser can edit
        location: "100",
        data: { name: "TestPlayer", attributes: [] }
    });

    const _thing = await dbojs.create({
        id: "2",
        flags: "thing",
        location: "1",
        data: { name: "TestThing", attributes: [] }
    });

    await t.step("Read Functions", async () => {
         assertEquals(await parser("[name(me)]", { enactor }), "TestPlayer");
         assertEquals(await parser("[loc(me)]", { enactor }), "100");
         assertEquals(await parser("[name(#2)]", { enactor }), "TestThing");
    });

    await t.step("Set Function", async () => {
        // Set attribute on self
        assertEquals(await parser("[set(me/DESC, A cool test player)]", { enactor }), "");
        
        // Verify with get()
        assertEquals(await parser("[get(me/DESC)]", { enactor }), "A cool test player");
        
        // Verify in DB
        const updated = await dbojs.queryOne({ id: "1" });
        if(updated) {
            const attr = updated.data?.attributes?.find(a => a.name === "DESC");
            assertEquals(attr?.value, "A cool test player");
        } else {
            throw new Error("Enactor not found in DB");
        }
    });

    await t.step("Set Function on Other", async () => {
        // Set attribute on thing
        assertEquals(await parser("[set(#2/DESC, A cool thing)]", { enactor }), "");
        assertEquals(await parser("[get(#2/DESC)]", { enactor }), "A cool thing");
    });
});

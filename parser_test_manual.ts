
import { parser } from "./src/services/Softcode/parser.ts";
import { dbojs } from "./src/services/Database/index.ts";
import "./src/services/Softcode/functions/index.ts"; // Register functions
import { getNextId } from "./src/utils/getNextId.ts";

// Mock DB setup if needed, or use existing if running in full env?
// Since we are running `deno run`, we might not have DB connection unless we init.
// Let's rely on standard logic but we might need to mock `dbojs`.

// For this test, I'll try to use the functions. 
// But `u()` needs `target` which needs `dbojs`.
// I'll try to mock dbojs `queryOne` and `get` if possible, or just run valid tests if DB is reachable.
// Since `deno task start` is running, DB might be locked? KV can have multiple connections usually.

async function main() {
    console.log("Starting Parser Test...");

    // Mock Objects
    const player = {
        id: "1",
        data: { name: "TestPlayer", attributes: [{ name: "MYATTR", value: "Hello %n!", setter: "1" }] },
        flags: "player connected",
        location: "0"
    };

    // We need to inject this into dbojs cache or similar if we want `target` to find it?
    // `target` uses `Obj.get` or `dbojs.queryOne`.
    // I can't easily mock the internal module state of `dbojs` from here without a testing framework.
    // BUT, I can pass `player` as `enactor` in context, so `%n` and `%#` should work without DB hits if they use the context object directly.
    // However, `u()` calls `target`, which hits DB.
    
    // Test 1: Substitutions
    console.log("Test 1: Substitutions");
    const res1 = await parser("ID: %# Name: %n Loc: %l", { enactor: player as any });
    console.log(`Result: "${res1}"`);
    if (res1 === "ID: #1 Name: TestPlayer Loc: #-1") {
        console.log("PASS");
    } else {
        console.log("FAIL");
    }

    // Test 2: v() - Needs DB or mocked `target` context?
    // v() calls `target(enactor, "me")`. `target` normally returns the object passed if it matches "me".
    // Let's verify `target` behavior. `src/utils/target.ts`
    // If input is "me", it usually returns enactor.
    // So if I pass `enactor`, `v(MYATTR)` might work if `getAttribute` works on the plain object.
    
    try {
        const res2 = await parser("[v(MYATTR)]", { enactor: player as any });
        console.log(`Result 2 (v): "${res2}"`);
         if (res2 === "Hello %n!") {
            console.log("PASS");
        } else {
            console.log("FAIL");
        }
    } catch(e) {
        console.log("FAIL Test 2", e);
    }
    
    // Test 3: u() - Recursive evaluation
    // u(MYATTR) should return "Hello TestPlayer!"
    try {
        const res3 = await parser("[u(MYATTR)]", { enactor: player as any });
         console.log(`Result 3 (u): "${res3}"`);
         if (res3 === "Hello TestPlayer!") {
            console.log("PASS");
        } else {
            console.log("FAIL");
        }
    } catch(e) {
        console.log("FAIL Test 3", e);
    }

    // Test 4: u() with args
    // attr: "You said %0"
    player.data.attributes.push({ name: "SAYIT", value: "You said %0", setter: "1" });
    try {
        const res4 = await parser("[u(SAYIT, something)]", { enactor: player as any });
        console.log(`Result 4 (u args): "${res4}"`);
        if (res4 === "You said something") {
            console.log("PASS");
        } else {
            console.log("FAIL");
        }
    } catch(e) {
         console.log("FAIL Test 4", e);
    }
    // Test 5: iter()
    // [iter(1 2 3, Item: ## Index: #@)]
    try {
        const res5 = await parser("[iter(1 2 3, Item: ## Index: #@)]", { enactor: player as any });
        console.log(`Result 5 (iter): "${res5}"`);
        if (res5 === "Item: 1 Index: 1 Item: 2 Index: 2 Item: 3 Index: 3") {
            console.log("PASS");
        } else {
            console.log("FAIL");
        }
    } catch(e) {
        console.log("FAIL Test 5", e);
    }
}

main();

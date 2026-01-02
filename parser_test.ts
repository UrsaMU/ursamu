import { Parser } from "./deps.ts";

const p = new Parser();
p.addSubs("test", {
    before: /test/g,
    after: "passed"
});

try {
    const result = p.substitute("test", "this is a test");
    console.log("Function support:", result === "this is a passed");
} catch (e) {
    console.log("Function support: No", (e as Error).message);
}

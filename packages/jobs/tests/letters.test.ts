import { assertEquals } from "@std/assert";
import { expandLetter } from "../src/letters.ts";
import type { IJob } from "../src/types.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("expandLetter placeholders", OPTS, () => {
  const job = {
    number: 7,
    title: "Hello",
    submitterName: "Bob",
    bucket: "BUG",
  } as IJob;
  const out = expandLetter(
    "Job %n %t by %r staff %s bucket %b: %c",
    { job, staff: "Ada", comment: "ok" },
  );
  assertEquals(
    out,
    "Job 7 Hello by Bob staff Ada bucket BUG: ok",
  );
});

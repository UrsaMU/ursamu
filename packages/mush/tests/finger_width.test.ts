import { assertEquals, assertLessOrEqual } from "@std/assert";
import {
  visLen,
  fitLine,
  dotLine,
  truncVis,
} from "../src/verbs/globals/finger-fields.ts";
import {
  header,
  setLayoutTemplates,
  clearLayoutTemplates,
} from "../src/format/handlers.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };
const WIDTH = 78;

function maxVisLine(block: string): number {
  return Math.max(
    0,
    ...block.split(/\r?\n/).map((l) => visLen(l)),
  );
}

Deno.test("finger-fields: fitLine and dotLine ≤78", OPTS, () => {
  assertLessOrEqual(visLen(fitLine("x".repeat(200))), WIDTH);
  assertLessOrEqual(
    visLen(dotLine("Character Quote", "q".repeat(200))),
    WIDTH,
  );
  assertEquals(visLen(truncVis("hello", 3)), 3);
});

Deno.test("finger header chrome ≤78 court layout", OPTS, () => {
  setLayoutTemplates({
    header: "[center(%ch%cy%b%0%b%cn,%1,%cg=%cn)]",
    divider:
      "[if(neq(words(%0),0), center(%ch%cy%b%0%b%cn,%1,%cg-%cn), repeat(%cg-%cn,%1))]",
    footer: "[repeat(%cg=%cn,%1)]",
  });
  const titles = [
    "Alice's +finger",
    "A".repeat(60) + "'s +finger",
    "Lem's +finger",
  ];
  for (const t of titles) {
    const h = header(t, "=", WIDTH);
    assertLessOrEqual(maxVisLine(h), WIDTH, h);
  }
  clearLayoutTemplates();
  const d = header("Someone's +finger", "=", WIDTH);
  assertLessOrEqual(maxVisLine(d), WIDTH, d);
});

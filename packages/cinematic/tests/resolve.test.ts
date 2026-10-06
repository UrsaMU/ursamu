/** Partial-name resolution tests. */
import { assertEquals } from "@std/assert";
import {
  resolveAttr,
  resolveSkill,
  slugify,
  traitEntry,
} from "../src/resolve.ts";

Deno.test("resolveAttr — common abbreviations", () => {
  assertEquals(resolveAttr("dex"), "dexterity");
  assertEquals(resolveAttr("int"), "intelligence");
  assertEquals(resolveAttr("str"), "strength");
  assertEquals(resolveAttr("con"), "constitution");
  assertEquals(resolveAttr("per"), "perception");
  assertEquals(resolveAttr("wil"), "willpower");
});

Deno.test("resolveAttr — full names and case", () => {
  assertEquals(resolveAttr("Strength"), "strength");
  assertEquals(resolveAttr("Willpower"), "willpower");
});

Deno.test("resolveAttr — unknown or ambiguous is undefined", () => {
  assertEquals(resolveAttr("cha"), undefined);
  assertEquals(resolveAttr(""), undefined);
});

Deno.test("resolveSkill — prefixes", () => {
  assertEquals(resolveSkill("kung"), { slug: "kung-fu" });
  assertEquals(resolveSkill("gun"), { slug: "gun-fu" });
  assertEquals(resolveSkill("acro"), { slug: "acrobatics" });
  assertEquals(resolveSkill("notice"), { slug: "notice" });
  assertEquals(resolveSkill("getting"), {
    slug: "getting-medieval",
  });
});

Deno.test("resolveSkill — full names/slugs", () => {
  assertEquals(resolveSkill("Kung Fu"), { slug: "kung-fu" });
  assertEquals(resolveSkill("mr-fix-it"), { slug: "mr-fix-it" });
});

Deno.test("resolveSkill — ambiguity reports candidates", () => {
  const m = resolveSkill("c");
  assertEquals("error" in m, true);
  if ("error" in m) {
    assertEquals(m.error.includes("computers"), true);
    assertEquals(m.error.includes("crime"), true);
  }
  assertEquals("error" in resolveSkill("zodiac"), true);
});

Deno.test("slugify — slashes and dots normalize", () => {
  assertEquals(slugify("Cop/Detective"), "cop-detective");
  assertEquals(slugify("love/tragic love"), "love-tragic-love");
  assertEquals(slugify("Mr. Fix-It"), "mr-fix-it");
  assertEquals(slugify("  criminal/wise  guy "), "criminal-wise-guy");
});

Deno.test("resolveSkill — display names with punctuation", () => {
  assertEquals(resolveSkill("Mr. Fix-It"), { slug: "mr-fix-it" });
  assertEquals(resolveSkill("Mr Fix It"), { slug: "mr-fix-it" });
  assertEquals(resolveSkill("Gun Fu"), { slug: "gun-fu" });
});

Deno.test("traitEntry — parse, qualifiers, negative rejection", () => {
  assertEquals(traitEntry("contacts=2:RIPD"), {
    slug: "contacts",
    level: 2,
    note: "RIPD",
  });
  assertEquals(traitEntry("athlete"), {
    slug: "athlete",
    level: 1,
    note: "",
  });
  assertEquals(traitEntry("resources=-2"), {
    error: "Rating cannot be negative.",
  });
  assertEquals(traitEntry("good/bad luck=-1"), {
    error: "Rating cannot be negative.",
  });
  assertEquals(traitEntry(""), null);
});

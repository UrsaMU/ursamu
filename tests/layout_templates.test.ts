/**
 * Config-driven layout mushcode templates
 * (game.layout.header / divider / footer).
 */
import { assertEquals } from "@std/assert";
import {
  header,
  divider,
  footer,
  setLayoutTemplates,
  clearLayoutTemplates,
  expandLayoutTemplate,
  hasLayoutTemplate,
} from "@ursamu/mush";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("expandLayoutTemplate — center + color + %0/%1", OPTS, () => {
  const out = expandLayoutTemplate(
    "[center(%ch%cy%0%cn,%1,%cg=%cn)]",
    ["Title", "20", "="],
  );
  // Visible: Title (5) centered in 20 with = fill
  assertEquals(out.includes("%ch%cyTitle%cn"), true);
  assertEquals(out.includes("%cg=%cn"), true);
  // strip color for length check
  const vis = out
    .replace(/%c[a-zA-Z]/g, "")
    .replace(/%[nrtbR]/g, "");
  assertEquals(vis.length, 20);
  assertEquals(vis.includes("Title"), true);
});

Deno.test("expandLayoutTemplate — repeat + %r", OPTS, () => {
  const out = expandLayoutTemplate(
    "[repeat(=,%1)]%r%0",
    ["Hi", "5", "="],
  );
  assertEquals(out, "=====\nHi");
});

Deno.test("header() uses config template when set", OPTS, () => {
  setLayoutTemplates({
    header: "[center(%ch%cy%0%cn,%1,%cg=%cn)]",
  });
  try {
    assertEquals(hasLayoutTemplate("header"), true);
    const out = header("Sheet", "=", 24);
    const vis = out
      .replace(/%c[a-zA-Z]/g, "")
      .replace(/%[nrtbR]/g, "");
    assertEquals(vis.length, 24);
    assertEquals(vis.includes("Sheet"), true);
    assertEquals(out.includes("%cy"), true);
  } finally {
    clearLayoutTemplates();
  }
});

Deno.test("divider() / footer() use own templates", OPTS, () => {
  setLayoutTemplates({
    divider: "[center(%0,%1,-)]",
    footer:  "[repeat(=,%1)]",
  });
  try {
    const d = divider("Sec", "-", 16);
    assertEquals(d.length, 16);
    assertEquals(d.includes("Sec"), true);

    const f = footer("", "=", 10);
    assertEquals(f, "==========");
  } finally {
    clearLayoutTemplates();
  }
});

Deno.test("header() falls back to default without template", OPTS, () => {
  clearLayoutTemplates();
  const out = header("X", "=", 10);
  // default is 3-line block
  assertEquals(out.includes("=========="), true);
  assertEquals(out.includes("%chX%cn"), true);
});

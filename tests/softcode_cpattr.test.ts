/**
 * tests/softcode_cpattr.test.ts
 *
 * Unit tests for @cpattr, @mvattr, and @grep attribute logic.
 * Tests the in-memory attribute manipulation functions directly.
 */
import { assertEquals, assertStringIncludes } from "@std/assert";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

// ── Inline attribute types ─────────────────────────────────────────────────

interface IAttr { name: string; value: string; type?: string; setter: string; hidden?: boolean; }

function makeObj(id: string, attrs: IAttr[] = []): { id: string; attrs: IAttr[] } {
  return { id, attrs: [...attrs] };
}

// ── globToRegex (same logic as in commands) ────────────────────────────────

function globToRegex(pat: string): RegExp {
  const escaped = pat.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`, "i");
}

// ── @cpattr inline logic ───────────────────────────────────────────────────

function cpattr(
  src: ReturnType<typeof makeObj>,
  attrGlob: string,
  dest: ReturnType<typeof makeObj>,
  newName?: string,
  opts: { clear?: boolean } = {},
): { copied: number; src: IAttr[]; dest: IAttr[] } {
  const re = globToRegex(attrGlob);
  const matched = src.attrs.filter(a => re.test(a.name));
  if (matched.length === 0) return { copied: 0, src: src.attrs, dest: dest.attrs };

  for (const attr of matched) {
    const targetName = (matched.length === 1 && newName ? newName : (newName ?? attr.name)).toUpperCase();
    const i = dest.attrs.findIndex(a => a.name.toLowerCase() === targetName.toLowerCase());
    const newAttr: IAttr = { name: targetName, value: attr.value, setter: "1", type: attr.type };
    if (i >= 0) dest.attrs[i] = newAttr;
    else dest.attrs.push(newAttr);
  }

  if (opts.clear) src.attrs = src.attrs.filter(a => !matched.some(m => m.name === a.name));

  return { copied: matched.length, src: src.attrs, dest: dest.attrs };
}

// ── @mvattr inline logic ───────────────────────────────────────────────────

function mvattr(
  obj: ReturnType<typeof makeObj>,
  oldName: string,
  newName: string,
  extras: string[] = [],
  canModify = true,
): { renamed: boolean; attrs: IAttr[] } {
  const srcIdx = obj.attrs.findIndex(a => a.name.toLowerCase() === oldName.toLowerCase());
  if (srcIdx === -1) return { renamed: false, attrs: obj.attrs };

  const src = obj.attrs[srcIdx];
  const upsert = (name: string) => {
    const upper = name.toUpperCase();
    const i = obj.attrs.findIndex(a => a.name.toLowerCase() === upper.toLowerCase());
    const entry: IAttr = { name: upper, value: src.value, setter: "1", type: src.type };
    if (i >= 0) obj.attrs[i] = entry; else obj.attrs.push(entry);
  };

  upsert(newName);
  for (const e of extras) upsert(e);
  if (canModify) obj.attrs.splice(srcIdx, 1);

  return { renamed: canModify, attrs: obj.attrs };
}

// ── @grep inline logic ─────────────────────────────────────────────────────

function grep(attrs: IAttr[], attrGlob: string, searchStr: string, regexp = false): string[] {
  const attrRe = globToRegex(attrGlob);
  const valueRe = regexp
    ? new RegExp(searchStr, "i")
    : new RegExp(searchStr.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  return attrs.filter(a => attrRe.test(a.name) && valueRe.test(a.value)).map(a => a.name);
}

// ── @cpattr tests ──────────────────────────────────────────────────────────

Deno.test("@cpattr — copies single named attribute", OPTS, () => {
  const src  = makeObj("1", [{ name: "DESC", value: "A red box.", setter: "1" }]);
  const dest = makeObj("2");
  const { copied } = cpattr(src, "DESC", dest);
  assertEquals(copied, 1);
  assertEquals(dest.attrs[0].name, "DESC");
  assertEquals(dest.attrs[0].value, "A red box.");
});

Deno.test("@cpattr — copies with new name", OPTS, () => {
  const src  = makeObj("1", [{ name: "DESC", value: "Shiny.", setter: "1" }]);
  const dest = makeObj("2");
  cpattr(src, "DESC", dest, "ALTDESC");
  assertEquals(dest.attrs[0].name, "ALTDESC");
});

Deno.test("@cpattr — wildcard copies multiple attrs", OPTS, () => {
  const src = makeObj("1", [
    { name: "SKILL_SWIM", value: "3", setter: "1" },
    { name: "SKILL_JUMP", value: "5", setter: "1" },
    { name: "DESC", value: "Tall.", setter: "1" },
  ]);
  const dest = makeObj("2");
  const { copied } = cpattr(src, "SKILL_*", dest);
  assertEquals(copied, 2);
  assertEquals(dest.attrs.map(a => a.name).sort(), ["SKILL_JUMP", "SKILL_SWIM"]);
});

Deno.test("@cpattr /clear — removes source attr after copy", OPTS, () => {
  const src  = makeObj("1", [{ name: "TEMP", value: "draft", setter: "1" }]);
  const dest = makeObj("2");
  cpattr(src, "TEMP", dest, undefined, { clear: true });
  assertEquals(src.attrs.length, 0);
  assertEquals(dest.attrs[0].name, "TEMP");
});

Deno.test("@cpattr — overwrites existing dest attr", OPTS, () => {
  const src  = makeObj("1", [{ name: "DESC", value: "New.", setter: "1" }]);
  const dest = makeObj("2", [{ name: "DESC", value: "Old.", setter: "2" }]);
  cpattr(src, "DESC", dest);
  assertEquals(dest.attrs.length, 1);
  assertEquals(dest.attrs[0].value, "New.");
});

Deno.test("@cpattr — no match returns 0 copies", OPTS, () => {
  const src  = makeObj("1", [{ name: "DESC", value: "x", setter: "1" }]);
  const dest = makeObj("2");
  const { copied } = cpattr(src, "NOTEXIST", dest);
  assertEquals(copied, 0);
  assertEquals(dest.attrs.length, 0);
});

// ── @mvattr tests ──────────────────────────────────────────────────────────

Deno.test("@mvattr — renames attribute", OPTS, () => {
  const obj = makeObj("1", [{ name: "DESC", value: "Tall.", setter: "1" }]);
  const { renamed } = mvattr(obj, "DESC", "DESCRIPTION");
  assertEquals(renamed, true);
  assertEquals(obj.attrs.find(a => a.name === "DESCRIPTION")?.value, "Tall.");
  assertEquals(obj.attrs.find(a => a.name === "DESC"), undefined);
});

Deno.test("@mvattr — copies to extra names", OPTS, () => {
  const obj = makeObj("1", [{ name: "TEMP", value: "draft", setter: "1" }]);
  mvattr(obj, "TEMP", "BACKUP", ["ARCHIVE"]);
  const names = obj.attrs.map(a => a.name).sort();
  assertEquals(names, ["ARCHIVE", "BACKUP"]);
});

Deno.test("@mvattr — non-modifiable attr: copies without removing original", OPTS, () => {
  const obj = makeObj("1", [{ name: "LAST", value: "2026-01-01", setter: "99" }]);
  mvattr(obj, "LAST", "LAST_COPY", [], false /* canModify=false */);
  assertEquals(obj.attrs.find(a => a.name === "LAST")?.value, "2026-01-01"); // still there
  assertEquals(obj.attrs.find(a => a.name === "LAST_COPY")?.value, "2026-01-01");
});

Deno.test("@mvattr — missing attr returns renamed=false", OPTS, () => {
  const obj = makeObj("1", []);
  const { renamed } = mvattr(obj, "NOTHERE", "NEW");
  assertEquals(renamed, false);
});

// ── @grep tests ────────────────────────────────────────────────────────────

Deno.test("@grep — finds attr containing string", OPTS, () => {
  const attrs: IAttr[] = [
    { name: "DESC", value: "A red sword.", setter: "1" },
    { name: "ODESC", value: "A blue shield.", setter: "1" },
  ];
  const hits = grep(attrs, "*", "red");
  assertEquals(hits, ["DESC"]);
});

Deno.test("@grep — wildcard attr glob filters by name", OPTS, () => {
  const attrs: IAttr[] = [
    { name: "SKILL_SWIM", value: "3", setter: "1" },
    { name: "SKILL_JUMP", value: "5", setter: "1" },
    { name: "DESC", value: "3 meters tall", setter: "1" },
  ];
  // Only SKILL_* attrs containing "3"
  const hits = grep(attrs, "SKILL_*", "3");
  assertEquals(hits, ["SKILL_SWIM"]);
});

Deno.test("@grep — /regexp uses regex pattern", OPTS, () => {
  const attrs: IAttr[] = [
    { name: "SAY", value: "say Hello world", setter: "1" },
    { name: "POSE", value: "pose nods", setter: "1" },
  ];
  const hits = grep(attrs, "*", "^say", true);
  assertEquals(hits, ["SAY"]);
});

Deno.test("@grep — no matches returns empty array", OPTS, () => {
  const attrs: IAttr[] = [{ name: "DESC", value: "nothing here", setter: "1" }];
  assertEquals(grep(attrs, "*", "ZZZNOMATCH"), []);
});

Deno.test("@grep — case-insensitive match", OPTS, () => {
  const attrs: IAttr[] = [{ name: "DESC", value: "A Red Sword.", setter: "1" }];
  assertEquals(grep(attrs, "DESC", "red").length, 1);
  assertEquals(grep(attrs, "desc", "red").length, 1); // attr name glob also insensitive
});

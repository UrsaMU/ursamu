/**
 * Editor dirty-detection helpers (mirrors admin/app.js).
 */
import { assertEquals } from "@std/assert";

interface PageSnapshot {
  path: string;
  title: string;
  body: string;
  draft: boolean;
  readLock: string;
  tags: string[];
}

function snapshotFromFields(f: {
  path: string;
  title: string;
  body: string;
  draft: boolean;
  readLock: string;
  tags: string[];
}): PageSnapshot {
  return {
    path: f.path,
    title: f.title.trim(),
    body: f.body.replace(/\r\n/g, "\n"),
    draft: !!f.draft,
    readLock: f.readLock || "connected",
    tags: [...f.tags].map((t) => t.toLowerCase()).sort(),
  };
}

function snapshotsEqual(a: PageSnapshot, b: PageSnapshot): boolean {
  return (
    a.path === b.path &&
    a.title === b.title &&
    a.body === b.body &&
    a.draft === b.draft &&
    a.readLock === b.readLock &&
    a.tags.join("\0") === b.tags.join("\0")
  );
}

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("snapshotsEqual — identical", OPTS, () => {
  const a = snapshotFromFields({
    path: "lore/x",
    title: " X ",
    body: "hi\r\nthere",
    draft: true,
    readLock: "connected",
    tags: ["B", "a"],
  });
  const b = snapshotFromFields({
    path: "lore/x",
    title: "X",
    body: "hi\nthere",
    draft: true,
    readLock: "connected",
    tags: ["a", "b"],
  });
  assertEquals(snapshotsEqual(a, b), true);
});

Deno.test("snapshotsEqual — body change is dirty", OPTS, () => {
  const a = snapshotFromFields({
    path: "p",
    title: "T",
    body: "one",
    draft: false,
    readLock: "connected",
    tags: [],
  });
  const b = snapshotFromFields({
    path: "p",
    title: "T",
    body: "two",
    draft: false,
    readLock: "connected",
    tags: [],
  });
  assertEquals(snapshotsEqual(a, b), false);
});

Deno.test("snapshotsEqual — draft flip is dirty", OPTS, () => {
  const base = {
    path: "p",
    title: "T",
    body: "x",
    readLock: "staff",
    tags: ["lore"],
  };
  const a = snapshotFromFields({ ...base, draft: true });
  const b = snapshotFromFields({ ...base, draft: false });
  assertEquals(snapshotsEqual(a, b), false);
});

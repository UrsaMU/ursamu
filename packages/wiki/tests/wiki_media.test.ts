/**
 * Per-page wiki media (_assets) helpers.
 */
import {
  assertEquals,
  assertExists,
} from "@std/assert";
import { join } from "@std/path";
import { ensureDir } from "@std/fs";
import {
  safeAssetName,
  publicAssetUrl,
  assetRelPath,
  assetsRelDir,
  nameFromUrl,
  listPageMedia,
  savePageMedia,
  deletePageMedia,
  resolveImageSrc,
  shortImageMarkdown,
  ASSETS_DIR,
} from "../src/media.ts";
import { serializePage, WIKI_DIR } from "../src/fs.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("safeAssetName accepts image names", OPTS, () => {
  assertEquals(safeAssetName("Hero.PNG"), "hero.png");
  assertEquals(safeAssetName("map-1.webp"), "map-1.webp");
  assertEquals(safeAssetName("a.b-c_d.jpg"), "a.b-c_d.jpg");
});

Deno.test("safeAssetName rejects path tricks", OPTS, () => {
  // Basename is taken; ".." in the string is rejected
  assertEquals(safeAssetName("../x.png"), null);
  assertEquals(safeAssetName("noext"), null);
  assertEquals(safeAssetName("file.pdf"), null);
  assertEquals(safeAssetName(""), null);
  // Spaces and odd chars are sanitized
  assertEquals(safeAssetName("My Photo.PNG"), "my-photo.png");
  assertEquals(safeAssetName("/etc/passwd.png"), "passwd.png");
});

Deno.test("publicAssetUrl + paths", OPTS, () => {
  assertEquals(assetsRelDir("lore/city"), `lore/city/${ASSETS_DIR}`);
  assertEquals(
    assetRelPath("lore/city", "hero.png"),
    `lore/city/${ASSETS_DIR}/hero.png`,
  );
  assertEquals(
    publicAssetUrl("lore/city", "hero.png"),
    `/api/v1/wiki/lore/city/${ASSETS_DIR}/hero.png`,
  );
});

Deno.test("nameFromUrl picks last path segment", OPTS, () => {
  assertEquals(
    nameFromUrl("https://cdn.example.com/a/b/Crest.PNG", ""),
    "crest.png",
  );
});

Deno.test("resolveImageSrc short refs", OPTS, () => {
  assertEquals(
    resolveImageSrc("crest.png", "lore/city"),
    "/api/v1/wiki/lore/city/_assets/crest.png",
  );
  assertEquals(
    resolveImageSrc("_assets/crest.png", "lore/city"),
    "/api/v1/wiki/lore/city/_assets/crest.png",
  );
  assertEquals(
    resolveImageSrc("/api/v1/wiki/x/_assets/a.png", "lore"),
    "/api/v1/wiki/x/_assets/a.png",
  );
  assertEquals(
    resolveImageSrc("https://cdn.example.com/a.png", "lore"),
    "https://cdn.example.com/a.png",
  );
  assertEquals(resolveImageSrc("nope", "lore"), null);
});

Deno.test("shortImageMarkdown", OPTS, () => {
  assertEquals(
    shortImageMarkdown("crest.png"),
    "![crest](crest.png)",
  );
  assertEquals(
    shortImageMarkdown("map.webp", "City map"),
    "![City map](map.webp)",
  );
});

Deno.test(
  "save/list/delete page media round-trip",
  OPTS,
  async () => {
    const prev = Deno.cwd();
    const tmp = await Deno.makeTempDir({ prefix: "wiki-media-" });
    try {
      Deno.chdir(tmp);
      await ensureDir(WIKI_DIR);
      const pagePath = "lore/gallery";
      const pageFile = join(WIKI_DIR, "lore", "gallery.md");
      await ensureDir(join(WIKI_DIR, "lore"));
      await Deno.writeTextFile(
        pageFile,
        serializePage(
          { title: "Gallery", draft: false },
          "Body",
        ),
      );

      const png = new Uint8Array([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      ]);
      const saved = await savePageMedia(
        pagePath,
        "Banner.PNG",
        png,
      );
      assertEquals("error" in saved, false);
      if ("error" in saved) return;
      assertEquals(saved.name, "banner.png");
      assertEquals(
        saved.url,
        `/api/v1/wiki/${pagePath}/_assets/banner.png`,
      );
      assertExists(saved.size);

      const listed = await listPageMedia(pagePath);
      assertEquals(listed.length, 1);
      assertEquals(listed[0]?.name, "banner.png");

      const gone = await deletePageMedia(pagePath, "banner.png");
      assertEquals("ok" in gone && gone.ok, true);
      assertEquals((await listPageMedia(pagePath)).length, 0);
    } finally {
      Deno.chdir(prev);
      await Deno.remove(tmp, { recursive: true });
    }
  },
);

Deno.test(
  "savePageMedia requires existing page",
  OPTS,
  async () => {
    const prev = Deno.cwd();
    const tmp = await Deno.makeTempDir({ prefix: "wiki-media-" });
    try {
      Deno.chdir(tmp);
      await ensureDir(WIKI_DIR);
      const r = await savePageMedia(
        "missing/page",
        "a.png",
        new Uint8Array([1, 2, 3]),
      );
      assertEquals("error" in r, true);
      if ("error" in r) assertEquals(r.status, 404);
    } finally {
      Deno.chdir(prev);
      await Deno.remove(tmp, { recursive: true });
    }
  },
);

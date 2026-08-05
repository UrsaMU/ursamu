/**
 * avatar URL resolution for /api/v1/me and web chrome.
 */
import {
  assertEquals,
} from "jsr:@std/assert@1";
import {
  avatarUrlFromData,
  barePlayerId,
  resolveAvatarUrl,
} from "../src/routes/avatar-url.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("barePlayerId strips #", () => {
  assertEquals(barePlayerId("#12"), "12");
  assertEquals(barePlayerId("12"), "12");
});

Deno.test("avatarUrlFromData prefers avatarExt → /avatars/", () => {
  assertEquals(
    avatarUrlFromData("2", { avatarExt: "jpg" }),
    "/avatars/2.jpg",
  );
  assertEquals(
    avatarUrlFromData("#2", { avatarExt: "PNG" }),
    "/avatars/2.png",
  );
});

Deno.test(
  "resolveAvatarUrl prefers existing avatars over missing images",
  OPTS,
  async () => {
    const dir = await Deno.makeTempDir();
    const prev = Deno.cwd();
    try {
      Deno.chdir(dir);
      await Deno.mkdir("data/avatars", { recursive: true });
      await Deno.mkdir("data/images", { recursive: true });
      await Deno.writeFile(
        "data/avatars/2.jpg",
        new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
      );
      // Stale DB points at /images/ but file only in avatars
      const url = await resolveAvatarUrl("2", {
        image: "/images/2.jpg?v=stale",
        avatarExt: "jpg",
      });
      assertEquals((url ?? "").split("?")[0], "/avatars/2.jpg");
    } finally {
      Deno.chdir(prev);
      await Deno.remove(dir, { recursive: true });
    }
  },
);

Deno.test("avatarUrlFromData accepts legacy image URL", () => {
  assertEquals(
    avatarUrlFromData("5", {
      image: "https://cdn.example/a.png",
    }),
    "https://cdn.example/a.png",
  );
  assertEquals(
    avatarUrlFromData("5", { image: "/avatars/5.webp" }),
    "/avatars/5.webp",
  );
});

Deno.test("avatarUrlFromData null when empty", () => {
  assertEquals(avatarUrlFromData("9", {}), null);
  assertEquals(avatarUrlFromData("", { avatarExt: "jpg" }), null);
});

Deno.test(
  "resolveAvatarUrl finds file when data empty",
  OPTS,
  async () => {
    const dir = await Deno.makeTempDir();
    const prev = Deno.cwd();
    try {
      Deno.chdir(dir);
      await Deno.mkdir("data/avatars", { recursive: true });
      await Deno.writeFile(
        "data/avatars/99.jpg",
        new Uint8Array([0xff, 0xd8, 0xff]),
      );
      const url = await resolveAvatarUrl("99", {});
      // May include ?v= mtime cache-bust
      assertEquals(
        (url ?? "").split("?")[0],
        "/avatars/99.jpg",
      );
    } finally {
      Deno.chdir(prev);
      await Deno.remove(dir, { recursive: true });
    }
  },
);

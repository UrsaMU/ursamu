import { assertEquals } from "@std/assert";
import { describe, it, beforeAll, afterAll } from "@std/testing/bdd";
import { clean, stripMushMarkup, resolveAvatar } from "../src/helpers.ts";
import {
  getDiscordConfig,
  setWebhook,
  clearWebhook,
  setPublicUrl,
} from "../src/config.ts";
import { discordRouteHandler } from "../src/router.ts";
import { dbojs } from "@ursamu/mush";
import { DBO } from "@ursamu/core";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

describe("Discord Plugin — Helpers", () => {
  it("clean strips MUSH and ANSI codes and clamps length", () => {
    assertEquals(clean("%ch%cyTestPlayer%cn"), "TestPlayer");
    assertEquals(clean("A".repeat(100)), "A".repeat(80));
    assertEquals(clean("   "), "Unknown");
  });

  it("clean strips truecolor moniker tags", () => {
    const moniker =
      "<#ff0000>D<#ff1905>i<#ff320a>a%cn";
    assertEquals(clean(moniker), "Dia");
  });

  it("stripMushMarkup drops truecolor and keeps text", () => {
    const raw =
      "<#ff0000>D<#ff1905>i<#ff320a>a%cn tests.";
    assertEquals(stripMushMarkup(raw), "Dia tests.");
  });

  it("resolveAvatar is undefined without public url or file", async () => {
    assertEquals(await resolveAvatar("p1", "PlayerOne", ""), undefined);
    assertEquals(
      await resolveAvatar("missing", "X", "https://game.example"),
      undefined,
    );
  });

  it("resolveAvatar uses public file with extension", async () => {
    await Deno.mkdir("data/avatars", { recursive: true });
    const id = "avatar_resolve_test_p1";
    const path = `data/avatars/${id}.png`;
    await Deno.writeFile(path, new Uint8Array([1, 2, 3]));
    try {
      const url = await resolveAvatar(
        id,
        "PlayerOne",
        "https://game.example/",
      );
      // Real filename, no query string (Discord drops those).
      assertEquals(url, `https://game.example/avatars/${id}.png`);
    } finally {
      await Deno.remove(path).catch(() => {});
    }
  });
});

describe("Discord Plugin — Config & Router", () => {
  beforeAll(async () => {
    // Ensure DB is clean
    await dbojs.delete({ id: "discord" }).catch(() => {});
  });

  afterAll(async () => {
    await DBO.close();
  });

  it("config set, clear, and get operations work", async () => {
    await setWebhook("jobs", "https://discord.com/api/webhooks/1");
    let cfg = await getDiscordConfig();
    assertEquals(cfg.webhooks["jobs"], "https://discord.com/api/webhooks/1");

    await setPublicUrl("https://game.com");
    cfg = await getDiscordConfig();
    assertEquals(cfg.publicUrl, "https://game.com");

    await clearWebhook("jobs");
    cfg = await getDiscordConfig();
    assertEquals(cfg.webhooks["jobs"], undefined);
  });

  it("router rejects unauthorized requests", async () => {
    const req = new Request("http://localhost/api/v1/discord/webhooks");
    const res = await discordRouteHandler(req, null);
    assertEquals(res.status, 401);
  });
});

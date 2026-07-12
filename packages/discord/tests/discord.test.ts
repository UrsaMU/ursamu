import { assertEquals, assertStringIncludes } from "@std/assert";
import { describe, it, beforeAll, afterAll } from "@std/testing/bdd";
import { clean, resolveAvatar } from "../src/helpers.ts";
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

  it("resolveAvatar returns RoboHash fallback when no public url", async () => {
    const url = await resolveAvatar("p1", "PlayerOne", "");
    assertStringIncludes(url, "robohash.org/PlayerOne");
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

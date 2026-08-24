/**
 * Playwright E2E for staff Events console.
 *
 * Requires games/events-local (auto-started via harness) and
 * Playwright Chromium browsers.
 */
import {
  assert,
  assertEquals,
  assertStringIncludes,
} from "jsr:@std/assert@1";
import {
  ADMIN,
  BASE,
  ensureGame,
  ensureGod,
  hasPlaywright,
  OPTS,
  stopGameIfStarted,
} from "./harness.ts";

const DESKTOP = {
  viewport: { width: 1280, height: 800 },
};

Deno.test({
  name: "playwright: admin events full flow",
  ...OPTS,
  sanitizeExit: false,
  fn: async () => {
    if (!hasPlaywright()) {
      throw new Error(
        "Playwright browsers missing — run: npx playwright install chromium",
      );
    }
    await ensureGame();
    const staff = await ensureGod();

    const { chromium } = await import("npm:playwright@1.49.1");
    const browser = await chromium.launch({ headless: true });
    try {
      const context = await browser.newContext(DESKTOP);
      const page = await context.newPage();

      // Seed token the way the SPA expects (sessionStorage)
      await page.goto(ADMIN + "/", {
        waitUntil: "domcontentloaded",
        timeout: 45000,
      });
      await page.evaluate((token) => {
        sessionStorage.setItem("ursamu.webAdmin.token", token);
      }, staff.token);

      // Navigate to events
      await page.goto(ADMIN + "/events", {
        waitUntil: "networkidle",
        timeout: 45000,
      });

      // Page shell
      await page.waitForSelector("h1", { timeout: 20000 });
      const h1 = await page.locator("h1").first().innerText();
      assertStringIncludes(h1.toLowerCase(), "event");

      // Create new event via UI
      await page.getByRole("button", { name: /new event/i }).click();
      await page.waitForSelector("text=Create event", { timeout: 10000 });

      const title = "PW Gala " + Date.now().toString(36);
      await page.locator('label:has-text("Title") input').fill(title);
      await page.locator('label:has-text("Start") input').fill(
        "2036-09-01 20:00",
      );
      await page.locator('label:has-text("Location") input').fill(
        "Grand Hall",
      );
      await page.locator('label:has-text("Description") textarea').fill(
        "Playwright created event for E2E.",
      );
      await page.getByRole("button", { name: /^create$/i }).click();

      // Staff console uses WS RPC — wait on DOM text (CSP blocks page.evaluate).
      await page.getByText(title, { exact: false }).first().waitFor({
        state: "visible",
        timeout: 25000,
      });
      const body = await page.locator("body").innerText();
      assertStringIncludes(body, title);
      if (!body.includes("Grand Hall")) {
        await page.locator("table.dash-table tbody tr", { hasText: title })
          .first()
          .click();
        await page.getByText("Grand Hall", { exact: false }).first().waitFor({
          state: "visible",
          timeout: 10000,
        });
      }

      // List row present
      const row = page.locator("table.dash-table tbody tr", {
        hasText: title,
      });
      await row.first().waitFor({ timeout: 10000 });
      assertEquals(await row.count() >= 1, true);

      // Mark active
      await page.getByRole("button", { name: /mark active/i }).click();
      await page.waitForTimeout(800);
      const afterActive = await page.locator("body").innerText();
      assert(
        afterActive.toLowerCase().includes("active") ||
          afterActive.includes("Status → active"),
        "expected active status feedback",
      );

      // Cancel event
      await page.getByRole("button", { name: /cancel event/i }).click();
      await page.waitForTimeout(800);
      const afterCancel = await page.locator("body").innerText();
      assert(
        afterCancel.toLowerCase().includes("cancel"),
        "expected cancelled feedback",
      );

      // Mobile viewport regression on same page
      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForTimeout(300);
      const mobileH1 = await page.locator("h1").first().isVisible();
      assertEquals(mobileH1, true);

      // REST still sees event as cancelled for staff
      const r = await fetch(
        BASE + "/api/v1/events?status=cancelled&limit=100",
        { headers: { Authorization: `Bearer ${staff.token}` } },
      );
      const data = await r.json() as {
        events?: { title: string; status: string }[];
      };
      assertEquals(r.ok, true);
      assertEquals(
        (data.events ?? []).some((e) => e.title === title),
        true,
        "cancelled event should appear in staff list filter",
      );
    } finally {
      await browser.close();
    }
  },
});

Deno.test({
  name: "playwright: unauth admin redirects to login",
  ...OPTS,
  fn: async () => {
    if (!hasPlaywright()) {
      throw new Error("Playwright browsers missing");
    }
    await ensureGame();
    const { chromium } = await import("npm:playwright@1.49.1");
    const browser = await chromium.launch({ headless: true });
    try {
      const context = await browser.newContext(DESKTOP);
      await context.clearCookies();
      const page = await context.newPage();
      await page.goto(ADMIN + "/events", {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });
      // SPA should land on login gate
      await page.waitForSelector("#login-user, input[name='username']", {
        timeout: 20000,
      });
      const text = (await page.locator("body").innerText()).toLowerCase();
      assert(
        text.includes("sign in") || text.includes("username"),
        "expected login gate",
      );
    } finally {
      await browser.close();
    }
  },
});

Deno.test({
  name: "e2e stop game if we started it",
  ...OPTS,
  sanitizeExit: false,
  fn: async () => {
    // Only stop when EVENTS_E2E_KEEP is not set
    if (Deno.env.get("EVENTS_E2E_KEEP") === "1") {
      console.log("[e2e] keeping game up (EVENTS_E2E_KEEP=1)");
      return;
    }
    await stopGameIfStarted();
  },
});

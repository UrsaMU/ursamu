/**
 * Playwright: local mobile /play client (live game or skip).
 *
 * Run against games/dnd (or any host with site + WS):
 *   BASE_URL=http://127.0.0.1:4203 deno test -A --unstable-kv \
 *     packages/site/tests/play_mobile.playwright.test.ts
 *
 * Defaults BASE_URL to http://127.0.0.1:4203. Skips cleanly when
 * the game is down or Playwright browsers are missing.
 */
import {
  assert,
  assertEquals,
  assertStringIncludes,
} from "jsr:@std/assert@1";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

const BASE = (Deno.env.get("BASE_URL") || "http://127.0.0.1:4203")
  .replace(/\/$/, "");

/** iPhone 12 / 13 logical CSS size */
const MOBILE = {
  viewport: { width: 390, height: 844 },
  userAgent:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) " +
    "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 " +
    "Mobile/15E148 Safari/604.1",
  isMobile: true,
  hasTouch: true,
};

function hasPlaywright(): boolean {
  const home = Deno.env.get("HOME") || "";
  for (const p of [
    home + "/Library/Caches/ms-playwright",
    home + "/.cache/ms-playwright",
  ]) {
    try {
      Deno.statSync(p);
      return true;
    } catch {
      /* try next */
    }
  }
  return false;
}

async function gameUp(): Promise<boolean> {
  try {
    const r = await fetch(BASE + "/", {
      signal: AbortSignal.timeout(3000),
    });
    return r.ok;
  } catch {
    return false;
  }
}

async function registerUser(): Promise<{
  username: string;
  password: string;
  token: string;
}> {
  const username = "pwmob" + Date.now().toString(36);
  const password = "TestPass123!";
  const r = await fetch(BASE + "/api/v1/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username,
      password,
      email: username + "@test.local",
    }),
  });
  const data = await r.json() as {
    token?: string;
    error?: string;
  };
  if (!r.ok || !data.token) {
    throw new Error(
      "register failed: " + (data.error || r.status),
    );
  }
  return { username, password, token: data.token };
}

Deno.test(
  "mobile play: unauth /play redirects to login",
  OPTS,
  async () => {
    if (!hasPlaywright()) {
      console.log("skip: playwright browsers not installed");
      return;
    }
    if (!(await gameUp())) {
      console.log("skip: game not up at " + BASE);
      return;
    }
    const { chromium } = await import("npm:playwright@1.49.1");
    const browser = await chromium.launch({ headless: true });
    try {
      const context = await browser.newContext(MOBILE);
      // No token
      await context.clearCookies();
      const page = await context.newPage();
      await page.goto(BASE + "/play", {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });
      // SPA may replace to /login?next=...
      await page.waitForURL(/login/, { timeout: 20000 });
      const url = page.url();
      assert(
        url.includes("login"),
        "expected login redirect, got " + url,
      );
      await page.waitForSelector("#auth-username, #site-auth-form", {
        timeout: 15000,
      });
      const body = await page.locator("body").innerText();
      assertStringIncludes(body.toLowerCase(), "sign in");
    } finally {
      await browser.close();
    }
  },
);

Deno.test(
  "mobile play: login UI + register lands on /play shell",
  OPTS,
  async () => {
    if (!hasPlaywright()) {
      console.log("skip: playwright browsers not installed");
      return;
    }
    if (!(await gameUp())) {
      console.log("skip: game not up at " + BASE);
      return;
    }
    const user = await registerUser();
    const { chromium } = await import("npm:playwright@1.49.1");
    const browser = await chromium.launch({ headless: true });
    try {
      const context = await browser.newContext(MOBILE);
      const page = await context.newPage();

      // Login page
      await page.goto(BASE + "/login?next=" +
        encodeURIComponent("/play"), {
        waitUntil: "networkidle",
        timeout: 30000,
      });
      await page.waitForSelector("#auth-username", {
        timeout: 15000,
      });
      await page.fill("#auth-username", user.username);
      await page.fill("#auth-password", user.password);
      await page.click("#auth-submit-btn");

      await page.waitForURL(/\/play/, { timeout: 20000 });
      // Play client mounts (status chip is visually hidden — use attached)
      await page.waitForSelector("#play-root", {
        state: "attached",
        timeout: 20000,
      });
      // Shell must enter play mode so layout shows the client
      await page.waitForFunction(() => {
        const shell = document.querySelector(".site-shell");
        return !!(shell && shell.classList.contains("is-mode-play"));
      }, { timeout: 15000 });
      await page.waitForSelector(".play-prompt__input", {
        state: "visible",
        timeout: 15000,
      });
      await page.waitForSelector(".play-prompt__send", {
        state: "visible",
        timeout: 10000,
      });

      // #play-root should be visible once mode-play + flex layout apply
      await page.waitForSelector("#play-root", {
        state: "visible",
        timeout: 15000,
      });

      // Connection status (sr-only) eventually open/connecting
      const status = await page.locator(".play-root__status")
        .textContent();
      console.log("play status:", (status || "").trim());

      const hasOut = await page.locator(
        ".play-output, #play-output, #play-root",
      ).count();
      assert(hasOut > 0, "expected play output/root");
    } finally {
      await browser.close();
    }
  },
);

Deno.test(
  "mobile play: SEND full-width + hamburger nav drawer",
  OPTS,
  async () => {
    if (!hasPlaywright()) {
      console.log("skip: playwright browsers not installed");
      return;
    }
    if (!(await gameUp())) {
      console.log("skip: game not up at " + BASE);
      return;
    }
    const user = await registerUser();
    const { chromium } = await import("npm:playwright@1.49.1");
    const browser = await chromium.launch({ headless: true });
    try {
      const context = await browser.newContext(MOBILE);
      const page = await context.newPage();

      // Inject token before navigation (durable path)
      await page.goto(BASE + "/", {
        waitUntil: "domcontentloaded",
        timeout: 20000,
      });
      await page.evaluate((tok) => {
        try {
          localStorage.setItem("ursamu.webAdmin.token", tok);
          sessionStorage.setItem("ursamu.webAdmin.token", tok);
        } catch { /* ignore */ }
      }, user.token);

      await page.goto(BASE + "/play", {
        waitUntil: "networkidle",
        timeout: 30000,
      });
      await page.waitForFunction(() => {
        const shell = document.querySelector(".site-shell");
        return !!(shell && shell.classList.contains("is-mode-play"));
      }, { timeout: 15000 });
      await page.waitForSelector("#play-root", {
        state: "visible",
        timeout: 20000,
      });
      await page.waitForSelector(".play-prompt__send", {
        state: "visible",
        timeout: 15000,
      });

      // SEND button should span most of the viewport width
      const sendBox = await page.locator(".play-prompt__send")
        .boundingBox();
      assert(sendBox, "SEND button box");
      const vp = page.viewportSize()!;
      // ≥ 70% of viewport (full-width touch target)
      assert(
        sendBox!.width >= vp.width * 0.7,
        `SEND width ${sendBox!.width} < 70% of ${vp.width}`,
      );
      // Touch-friendly height
      assert(
        sendBox!.height >= 40,
        `SEND height ${sendBox!.height} too small`,
      );

      // Hamburger / nav toggle
      const toggleSel =
        ".site-nav__toggle, [data-nav-toggle], " +
        ".site-nav button[aria-expanded]";
      const toggleCount = await page.locator(toggleSel).count();
      if (toggleCount > 0) {
        await page.locator(toggleSel).first().click();
        await page.waitForTimeout(400);
        const openNav = await page.locator(
          ".site-nav.is-open, .site-nav[data-open='true']",
        ).count();
        assert(openNav > 0, "expected open mobile nav");
        const list = page.locator(
          ".site-nav.is-open .site-nav__list",
        ).first();
        if (await list.count() > 0) {
          const box = await list.boundingBox();
          if (box) {
            assert(
              box.height >= vp.height * 0.35,
              `nav drawer height ${box.height} too short`,
            );
          }
        }
      } else {
        console.log("note: no nav toggle found (skin may differ)");
      }

      const shot = await Deno.makeTempFile({
        suffix: "-play-mobile.png",
      });
      await page.screenshot({ path: shot, fullPage: true });
      console.log("screenshot", shot);
    } finally {
      await browser.close();
    }
  },
);

Deno.test(
  "mobile play: localStorage-only token still mounts client",
  OPTS,
  async () => {
    if (!hasPlaywright()) {
      console.log("skip: playwright browsers not installed");
      return;
    }
    if (!(await gameUp())) {
      console.log("skip: game not up at " + BASE);
      return;
    }
    const user = await registerUser();
    const { chromium } = await import("npm:playwright@1.49.1");
    const browser = await chromium.launch({ headless: true });
    try {
      const context = await browser.newContext(MOBILE);
      const page = await context.newPage();
      await page.goto(BASE + "/", {
        waitUntil: "domcontentloaded",
        timeout: 20000,
      });
      // Only localStorage — simulates iOS dropping sessionStorage
      await page.evaluate((tok) => {
        try {
          sessionStorage.removeItem("ursamu.webAdmin.token");
        } catch { /* ignore */ }
        try {
          localStorage.setItem("ursamu.webAdmin.token", tok);
        } catch { /* ignore */ }
      }, user.token);

      await page.goto(BASE + "/play", {
        waitUntil: "networkidle",
        timeout: 30000,
      });
      // Must NOT bounce to login
      await page.waitForTimeout(1500);
      assert(
        !page.url().includes("/login"),
        "kicked to login with localStorage token: " + page.url(),
      );
      await page.waitForFunction(() => {
        const shell = document.querySelector(".site-shell");
        return !!(shell && shell.classList.contains("is-mode-play"));
      }, { timeout: 15000 });
      await page.waitForSelector("#play-root", {
        state: "visible",
        timeout: 20000,
      });
      // play.js should promote token into sessionStorage
      const promoted = await page.evaluate(() => {
        try {
          return !!sessionStorage.getItem(
            "ursamu.webAdmin.token",
          );
        } catch {
          return false;
        }
      });
      assertEquals(promoted, true);

      // Can type a command
      await page.waitForSelector(".play-prompt__input", {
        state: "visible",
        timeout: 10000,
      });
      await page.fill(".play-prompt__input", "look");
      await page.click(".play-prompt__send");
      await page.waitForTimeout(2000);
      const rootText = await page.locator("#play-root")
        .innerText();
      assert(
        rootText.length > 10,
        "expected play root content after look",
      );
    } finally {
      await browser.close();
    }
  },
);

Deno.test(
  "mobile play: FE assets cache-bust includes durable token code",
  OPTS,
  async () => {
    if (!(await gameUp())) {
      console.log("skip: game not up at " + BASE);
      return;
    }
    const playJs = await (await fetch(
      BASE + "/site/js/play.js",
    )).text();
    assertStringIncludes(playJs, "localStorage.getItem");
    assertStringIncludes(playJs, "ursamu.webAdmin.token");
    assertStringIncludes(playJs, "play-prompt__send");

    const siteJs = await (await fetch(
      BASE + "/site/js/site.js",
    )).text();
    assertStringIncludes(siteJs, "stillTok");
    assertStringIncludes(siteJs, "readAuthToken");
    assertStringIncludes(siteJs, "Mount play ASAP");
  },
);

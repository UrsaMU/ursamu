/**
 * Playwright FE tests for /chargen stepper (demo mode).
 * Run: deno test -A packages/site/tests/chargen_fe.playwright.test.ts
 *
 * Uses a local static server + demo mode so no game API is required.
 */
import {
  assertEquals,
  assertStringIncludes,
} from "jsr:@std/assert@1";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function hasPlaywright(): boolean {
  try {
    Deno.statSync(
      Deno.env.get("HOME") +
        "/Library/Caches/ms-playwright/chromium-1208",
    );
    return true;
  } catch {
    try {
      Deno.statSync(
        Deno.env.get("HOME") +
          "/.cache/ms-playwright",
      );
      return true;
    } catch {
      return false;
    }
  }
}

async function startStaticServer(
  root: string,
): Promise<{ port: number; close: () => void }> {
  const port = 18765 + Math.floor(Math.random() * 200);
  const server = Deno.serve({ port, hostname: "127.0.0.1" }, async (req) => {
    const url = new URL(req.url);
    let path = url.pathname;
    if (path === "/" || path === "/chargen" || path === "/chargen/") {
      path = "/index.html";
    }
    if (path.startsWith("/site/")) {
      path = path.slice("/site".length) || "/index.html";
    }
    const filePath = root + path;
    try {
      const data = await Deno.readFile(filePath);
      const ext = path.split(".").pop() || "";
      const types: Record<string, string> = {
        html: "text/html; charset=utf-8",
        js: "application/javascript",
        css: "text/css",
        svg: "image/svg+xml",
        png: "image/png",
        woff2: "font/woff2",
      };
      return new Response(data, {
        headers: {
          "content-type": types[ext] || "application/octet-stream",
        },
      });
    } catch {
      // SPA fallback
      try {
        const data = await Deno.readFile(root + "/index.html");
        return new Response(data, {
          headers: { "content-type": "text/html; charset=utf-8" },
        });
      } catch {
        return new Response("missing", { status: 404 });
      }
    }
  });
  return {
    port,
    close: () => {
      try {
        server.shutdown();
      } catch { /* ignore */ }
    },
  };
}

Deno.test(
  "chargen FE: stepper demo advances stages",
  OPTS,
  async () => {
    if (!hasPlaywright()) {
      console.log("skip: playwright browsers not installed");
      return;
    }

    // Dynamic import — optional dep for CI without browsers
    const { chromium } = await import("npm:playwright@1.49.1");

    const root = new URL("../public", import.meta.url).pathname;
    const srv = await startStaticServer(root);
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({
        viewport: { width: 1280, height: 800 },
      });

      // Minimal shell: inject config so site.js boots
      await page.route("**/site/config.json**", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            title: "Test Game",
            skin: "default",
            plainBg: true,
            nav: [
              { id: "home", label: "Home", href: "/" },
              {
                id: "chargen",
                label: "Chargen",
                href: "/chargen",
              },
            ],
            leftMenu: "",
            menuBlocks: {},
          }),
        });
      });
      await page.route("**/api/v1/wiki**", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: "[]",
        });
      });
      await page.route("**/api/v1/me**", async (route) => {
        await route.fulfill({
          status: 401,
          contentType: "application/json",
          body: '{"error":"Unauthorized"}',
        });
      });

      await page.goto(
        `http://127.0.0.1:${srv.port}/chargen?demo=1`,
        { waitUntil: "networkidle", timeout: 60000 },
      );
      // site.js loads chargen.js
      await page.waitForFunction(
        () => !!(globalThis as unknown as {
          SiteChargen?: { boot: () => void };
        }).SiteChargen,
        { timeout: 15000 },
      );
      await page.waitForSelector("[data-cg-stepper]", {
        timeout: 15000,
      });

      const steps = await page.locator(".cg-stepper__item").count();
      assertEquals(steps >= 6, true, "stepper has stages");

      const current = page.locator(".cg-stepper__item.is-current");
      assertStringIncludes(
        await current.innerText(),
        "Concept",
      );

      // Fill stage 1 (sequential so demo state settles)
      await page.fill("#concept", "Dream weaver escapee");
      await page.locator("#concept").dispatchEvent("change");
      await page.waitForTimeout(100);
      await page.selectOption("#virtue", "Just");
      await page.waitForTimeout(100);
      await page.selectOption("#vice", "Greedy");
      await page.waitForTimeout(150);

      await page.click("[data-cg-next]");
      await page.waitForFunction(() => {
        const cur = document.querySelector(
          ".cg-stepper__item.is-current",
        );
        return cur && /Template/i.test(cur.textContent || "");
      }, { timeout: 5000 });

      assertStringIncludes(
        await page.locator(".cg-stepper__item.is-current")
          .innerText(),
        "Template",
      );

      // Pick changeling
      await page.click('[data-cg-template="changeling"]');
      await page.waitForTimeout(200);
      await page.click("[data-cg-next]");
      await page.waitForTimeout(300);

      assertStringIncludes(
        await page.locator(".cg-header__sub").innerText(),
        "Stage 3",
      );

      // Screenshot for visual check
      const out = await Deno.makeTempFile({ suffix: ".png" });
      await page.screenshot({ path: out, fullPage: true });
      console.log("screenshot", out);

      // Back works
      await page.click("[data-cg-back]");
      await page.waitForTimeout(200);
      assertStringIncludes(
        await page.locator(".cg-stepper__item.is-current")
          .innerText(),
        "Template",
      );
    } finally {
      await browser.close();
      srv.close();
    }
  },
);

Deno.test(
  "chargen FE: gate shows sign-in without demo",
  OPTS,
  async () => {
    if (!hasPlaywright()) {
      console.log("skip: playwright browsers not installed");
      return;
    }
    const { chromium } = await import("npm:playwright@1.49.1");
    const root = new URL("../public", import.meta.url).pathname;
    const srv = await startStaticServer(root);
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.route("**/site/config.json**", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            title: "Test",
            plainBg: true,
            nav: [],
            leftMenu: "",
          }),
        });
      });
      await page.route("**/api/v1/**", async (route) => {
        await route.fulfill({
          status: 401,
          contentType: "application/json",
          body: '{"error":"Unauthorized"}',
        });
      });
      await page.goto(
        `http://127.0.0.1:${srv.port}/chargen`,
        { waitUntil: "networkidle", timeout: 60000 },
      );
      await page.waitForSelector("text=Sign in", {
        timeout: 15000,
      });
      const body = await page.locator("[data-site-main]").innerText();
      assertStringIncludes(body, "Sign in");
      assertStringIncludes(body, "Try demo");
    } finally {
      await browser.close();
      srv.close();
    }
  },
);

Deno.test(
  "chargen FE: Finish submits on final stage (demo)",
  OPTS,
  async () => {
    if (!hasPlaywright()) {
      console.log("skip: playwright browsers not installed");
      return;
    }
    const { chromium } = await import("npm:playwright@1.49.1");
    const root = new URL("../public", import.meta.url).pathname;
    const srv = await startStaticServer(root);
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({
        viewport: { width: 1280, height: 800 },
      });
      await page.route("**/site/config.json**", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            title: "Test",
            plainBg: true,
            nav: [
              { id: "chargen", label: "Chargen", href: "/chargen" },
            ],
            leftMenu: "",
          }),
        });
      });
      await page.route("**/api/v1/**", async (route) => {
        await route.fulfill({
          status: 401,
          contentType: "application/json",
          body: '{"error":"Unauthorized"}',
        });
      });
      await page.goto(
        `http://127.0.0.1:${srv.port}/chargen?demo=1`,
        { waitUntil: "networkidle", timeout: 60000 },
      );
      await page.waitForFunction(
        () => !!(globalThis as unknown as {
          SiteChargen?: { getState: () => unknown };
        }).SiteChargen,
        { timeout: 15000 },
      );
      await page.waitForSelector("[data-cg-stepper]", {
        timeout: 15000,
      });

      // Drive demo state to final stage with valid merits.
      await page.evaluate(() => {
        const SC = (globalThis as unknown as {
          SiteChargen: {
            getState: () => {
              stage: number;
              maxStage: number;
              sheet: {
                concept: string;
                virtue: string;
                vice: string;
                template: string;
                attributes: Record<string, number>;
                skills: Record<string, number>;
                merits: Record<string, number>;
              };
              isSubmitted?: boolean;
            };
          };
        }).SiteChargen;
        const st = SC.getState();
        st.sheet.concept = "Finish button tester";
        st.sheet.virtue = "Just";
        st.sheet.vice = "Greedy";
        st.sheet.template = "mortal";
        st.sheet.attributes = {
          intelligence: 5, wits: 2, resolve: 1,
          strength: 4, dexterity: 2, stamina: 1,
          presence: 3, manipulation: 2, composure: 1,
        };
        st.sheet.skills = {
          academics: 3, computer: 2, crafts: 2,
          investigation: 2, medicine: 1, occult: 1,
          athletics: 3, brawl: 2, drive: 2, firearms: 2,
          persuasion: 3, socialize: 2, streetwise: 2,
        };
        st.sheet.merits = {
          resources: 3,
          "contacts:cops": 2,
          "language:spanish": 1,
          barfly: 1,
        };
        // barfly is 2 dots in catalog — demo accepts any;
        // spend exactly 7: 3+2+1+1 = 7
        st.sheet.merits = {
          resources: 3,
          "contacts:cops": 2,
          "language:spanish": 1,
          fame: 1,
        };
        st.stage = st.maxStage || 6;
        st.isSubmitted = false;
      });

      // Re-boot so UI renders final stage Finish button
      await page.evaluate(() => {
        const SC = (globalThis as unknown as {
          SiteChargen: { boot: () => Promise<void> };
        }).SiteChargen;
        return SC.boot();
      });
      await page.waitForTimeout(200);

      // Force stage label + Finish via re-render path:
      // click Finish if present, else poke state through demo
      const finishText = await page.locator("[data-cg-next]")
        .innerText()
        .catch(() => "");
      if (/Finish/i.test(finishText)) {
        await page.click("[data-cg-next]");
      } else {
        // boot may reset stage — set again and call submit via
        // internal demo by advancing UI
        await page.evaluate(async () => {
          const SC = (globalThis as unknown as {
            SiteChargen: {
              getState: () => {
                stage: number;
                maxStage: number;
                sheet: {
                  concept: string;
                  virtue: string;
                  vice: string;
                  merits: Record<string, number>;
                };
                isSubmitted?: boolean;
                canAdvance?: boolean;
              };
              boot: () => Promise<void>;
            };
          }).SiteChargen;
          const st = SC.getState();
          st.stage = st.maxStage || 6;
          st.sheet.concept = "Finish button tester";
          st.sheet.virtue = "Just";
          st.sheet.vice = "Greedy";
          st.sheet.merits = {
            resources: 3,
            "contacts:cops": 2,
            "language:spanish": 1,
            fame: 1,
          };
          await SC.boot();
        });
        await page.waitForTimeout(200);
        await page.click("[data-cg-next]");
      }
      await page.waitForTimeout(300);

      const body = await page.locator("[data-site-main]")
        .innerText();
      assertStringIncludes(body, "Submitted");
      const st2 = await page.evaluate(() => {
        return (globalThis as unknown as {
          SiteChargen: {
            getState: () => { isSubmitted?: boolean };
          };
        }).SiteChargen.getState();
      });
      assertEquals(!!st2.isSubmitted, true);
    } finally {
      await browser.close();
      srv.close();
    }
  },
);

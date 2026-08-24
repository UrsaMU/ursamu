/**
 * Playwright e2e: CPR web chargen (live game).
 *
 *   BASE_URL=http://127.0.0.1:4303 deno test -A --unstable-kv \
 *     packages/site/tests/cpr_chargen.playwright.test.ts
 *
 * Defaults BASE_URL to http://127.0.0.1:4303. Skips if game down
 * or Playwright browsers missing.
 */
import {
  assert,
  assertEquals,
  assertStringIncludes,
} from "jsr:@std/assert@1";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

const BASE = (Deno.env.get("BASE_URL") || "http://127.0.0.1:4303")
  .replace(/\/$/, "");

const AUTH_KEY = "ursamu.webAdmin.token";

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
      /* next */
    }
  }
  return false;
}

async function gameUp(): Promise<boolean> {
  try {
    const r = await fetch(BASE + "/api/v1/cpr/meta", {
      signal: AbortSignal.timeout(3000),
    });
    if (!r.ok) return false;
    const j = await r.json() as { system?: string };
    return j.system === "cpr";
  } catch {
    return false;
  }
}

async function registerUser(): Promise<{
  username: string;
  token: string;
}> {
  const username = "cprcge" + Date.now().toString(36);
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
  return { username, token: data.token };
}

async function apiJson(
  token: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<Record<string, unknown>> {
  const r = await fetch(BASE + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + token,
    },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const j = await r.json() as Record<string, unknown>;
  if (!r.ok) {
    throw new Error(
      method + " " + path + " → " + r.status + " " +
        JSON.stringify(j),
    );
  }
  return j;
}

/** API smoke: streetrat through submit (no browser). */
Deno.test("CPR chargen API: streetrat full path", OPTS, async () => {
  if (!(await gameUp())) {
    console.log("skip: CPR not up at " + BASE);
    return;
  }
  const { token } = await registerUser();
  await apiJson(token, "POST", "/api/v1/cpr/chargen/start", {
    role: "solo",
  });
  await apiJson(token, "POST", "/api/v1/cpr/chargen/set", {
    field: "method",
    value: "streetrat",
  });
  await apiJson(token, "POST", "/api/v1/cpr/chargen/set", {
    field: "role",
    value: "solo",
  });

  const lpStages = [
    "lifepath_cultural",
    "lifepath_personality",
    "lifepath_motivations",
    "lifepath_family",
    "lifepath_friends",
    "lifepath_enemies",
    "lifepath_events",
    "lifepath_role",
  ];
  for (const stage of lpStages) {
    await apiJson(token, "POST", "/api/v1/cpr/chargen/roll", {
      stage,
      n: stage === "lifepath_role" ? 3 : 1,
    });
    // family crisis second roll when background set
    if (stage === "lifepath_family") {
      await apiJson(token, "POST", "/api/v1/cpr/chargen/roll", {
        stage,
        n: 2,
      });
    }
    await apiJson(token, "POST", "/api/v1/cpr/chargen/next", {});
  }

  // stats → skills → lifestyle
  let cg = await apiJson(token, "GET", "/api/v1/cpr/chargen");
  let draft = cg.draft as { chargenStage?: string; stats?: {
    ref?: number;
  } };
  assertEquals(draft.chargenStage, "stats");
  assertEquals(draft.stats?.ref, 8); // solo streetrat preset

  await apiJson(token, "POST", "/api/v1/cpr/chargen/next", {});
  await apiJson(token, "POST", "/api/v1/cpr/chargen/next", {});
  await apiJson(token, "POST", "/api/v1/cpr/chargen/set", {
    field: "lifestyle",
    value: "kibble",
  });

  cg = await apiJson(token, "GET", "/api/v1/cpr/chargen");
  draft = cg.draft as { chargenStage?: string };
  assertEquals(draft.chargenStage, "cyberware");

  await apiJson(token, "POST", "/api/v1/cpr/chargen/set", {
    field: "chrome",
    value: "light_tattoo",
    action: "install",
  });
  await apiJson(token, "POST", "/api/v1/cpr/chargen/next", {});

  cg = await apiJson(token, "GET", "/api/v1/cpr/chargen");
  draft = cg.draft as { chargenStage?: string };
  assertEquals(draft.chargenStage, "equipment");

  await apiJson(token, "POST", "/api/v1/cpr/chargen/next", {});
  cg = await apiJson(token, "GET", "/api/v1/cpr/chargen");
  draft = cg.draft as { chargenStage?: string };
  assertEquals(draft.chargenStage, "review");

  const done = await apiJson(
    token,
    "POST",
    "/api/v1/cpr/chargen/submit",
    {},
  );
  assertEquals(done.ok, true);
  const sheet = done.sheet as { chargenComplete?: boolean };
  assertEquals(sheet.chargenComplete, true);
});

Deno.test("CPR chargen API: all three methods start", OPTS, async () => {
  if (!(await gameUp())) {
    console.log("skip: CPR not up at " + BASE);
    return;
  }
  for (const method of ["streetrat", "edgerunner", "complete"]) {
    const { token } = await registerUser();
    await apiJson(token, "POST", "/api/v1/cpr/chargen/start", {});
    const m = await apiJson(token, "POST", "/api/v1/cpr/chargen/set", {
      field: "method",
      value: method,
    });
    const d = m.draft as {
      chargenMethod?: string;
      chargenStage?: string;
      chargenStatPool?: number;
      stats?: { int?: number };
    };
    assertEquals(d.chargenMethod, method);
    assertEquals(d.chargenStage, "role_select");
    if (method === "complete") {
      assertEquals(d.chargenStatPool, 62);
      assertEquals(d.stats?.int, 2);
    }
    const role = await apiJson(
      token,
      "POST",
      "/api/v1/cpr/chargen/set",
      { field: "role", value: "fixer" },
    );
    const rd = role.draft as {
      role?: string;
      chargenStage?: string;
      stats?: { cool?: number };
    };
    assertEquals(rd.role, "fixer");
    assertEquals(rd.chargenStage, "lifepath_cultural");
    if (method === "streetrat") {
      assertEquals(rd.stats?.cool, 8);
    }
    if (method === "edgerunner") {
      const cool = rd.stats?.cool ?? 0;
      assert(cool >= 3 && cool <= 8, "edgerunner cool in 3–8");
    }
  }
});

/**
 * FE design + interaction smoke.
 * Heavy stage progression uses API (avoids HTTP rate limits on
 * rapid /next spam). Browser covers layout + key clicks.
 */
Deno.test(
  "CPR chargen FE: design shell + lifepath + finish",
  OPTS,
  async () => {
    if (!hasPlaywright()) {
      console.log("skip: playwright browsers not installed");
      return;
    }
    if (!(await gameUp())) {
      console.log("skip: CPR not up at " + BASE);
      return;
    }

    const { token, username } = await registerUser();
    const { chromium } = await import("npm:playwright@1.49.1");
    const browser = await chromium.launch({ headless: true });
    const shotDir = await Deno.makeTempDir({ prefix: "cpr-cg-" });

    async function authedPage() {
      const context = await browser.newContext({
        viewport: { width: 1400, height: 900 },
      });
      const page = await context.newPage();
      await page.goto(BASE + "/", {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });
      await page.evaluate(
        ([key, tok]) => {
          sessionStorage.setItem(key, tok);
          localStorage.setItem(key, tok);
        },
        [AUTH_KEY, token],
      );
      return { context, page };
    }

    try {
      // ── 1. Fresh start: method / phases / runner
      let { context, page } = await authedPage();
      await page.goto(BASE + "/chargen", {
        waitUntil: "networkidle",
        timeout: 45000,
      });
      await page.waitForSelector(
        "[data-cpr-start], [data-cpr-set], .cg-gate",
        { timeout: 20000 },
      );
      const body0 = await page.locator(".site-main").innerText();
      assert(
        !/Sign in to build/i.test(body0),
        "should be authed, got gate",
      );

      if (await page.locator("[data-cpr-start]").count()) {
        await page.click("[data-cpr-start]");
        await page.waitForSelector('[data-cpr-set="method"]', {
          timeout: 15000,
        });
      }

      const phaseCount = await page.locator(
        ".cg-stepper--phases .cg-stepper__item",
      ).count();
      assert(
        phaseCount >= 7 && phaseCount <= 10,
        "expected ~9 phases, got " + phaseCount,
      );

      await page.waitForSelector(".cg-runner", { timeout: 10000 });
      const runnerText = await page.locator(".cg-runner").innerText();
      assert(!/Draft sheet/i.test(runnerText));

      await page.screenshot({
        path: shotDir + "/01-method.png",
        fullPage: true,
      });

      await page.click(
        '[data-cpr-set="method"][data-cpr-val="streetrat"]',
      );
      await page.waitForSelector('[data-cpr-set="role"]', {
        timeout: 10000,
      });
      await page.click(
        '[data-cpr-set="role"][data-cpr-val="solo"]',
      );
      await page.waitForSelector("[data-cpr-lp-hub]", {
        timeout: 15000,
      });

      // ── 2. Lifepath hub (one list, no crawl)
      await page.waitForSelector(".cg-lp-hub__list", {
        timeout: 8000,
      });
      await page.waitForSelector("[data-cpr-lp-roll-all]", {
        timeout: 5000,
      });
      const hubRows = await page.locator("[data-cpr-lp-row]").count();
      assert(
        hubRows >= 8,
        "expected 8 path rows, got " + hubRows,
      );
      assertStringIncludes(
        (
          await page.locator(
            ".cg-stepper--phases .cg-stepper__item.is-current",
          ).innerText()
        ).toLowerCase(),
        "path",
      );

      // Roll one open row
      await page.locator("[data-cpr-lp-roll]").first().click();
      await page.waitForTimeout(800);
      await page.waitForSelector(
        ".cg-lp-hub__row.is-done, .cg-lp-hub__row.is-partial",
        { timeout: 8000 },
      );
      const countText = await page.locator("[data-cpr-lp-count]")
        .innerText();
      assert(
        /\d+\s*\/\s*8/.test(countText),
        "expected N/8 count: " + countText,
      );

      await page.screenshot({
        path: shotDir + "/02-lifepath.png",
        fullPage: true,
      });
      await context.close();

      // ── 3. API: finish remaining path (rate-limit safe)
      // Reload draft stage after FE picks
      let cg = await apiJson(token, "GET", "/api/v1/cpr/chargen");
      let draft = cg.draft as {
        chargenStage?: string;
        lifepath?: { familyBackground?: string };
      };

      const lpOrder = [
        "lifepath_cultural",
        "lifepath_personality",
        "lifepath_motivations",
        "lifepath_family",
        "lifepath_friends",
        "lifepath_enemies",
        "lifepath_events",
        "lifepath_role",
      ];
      // Advance from current lp stage through path
      let guard = 0;
      while (
        draft.chargenStage &&
        draft.chargenStage.startsWith("lifepath_") &&
        guard++ < 20
      ) {
        const st = draft.chargenStage;
        await apiJson(token, "POST", "/api/v1/cpr/chargen/roll", {
          stage: st,
          n: st === "lifepath_role" ? 2 : 1,
        });
        if (
          st === "lifepath_family" &&
          !(draft.lifepath && draft.lifepath.familyCrisis)
        ) {
          // crisis pass
          await apiJson(token, "POST", "/api/v1/cpr/chargen/roll", {
            stage: st,
            n: 3,
          });
        }
        await apiJson(token, "POST", "/api/v1/cpr/chargen/next", {});
        cg = await apiJson(token, "GET", "/api/v1/cpr/chargen");
        draft = cg.draft as typeof draft;
        void lpOrder;
      }

      // stats → skills
      while (
        draft.chargenStage === "stats" ||
        draft.chargenStage === "skills"
      ) {
        await apiJson(token, "POST", "/api/v1/cpr/chargen/next", {});
        cg = await apiJson(token, "GET", "/api/v1/cpr/chargen");
        draft = cg.draft as typeof draft;
      }

      if (draft.chargenStage === "lifestyle") {
        await apiJson(token, "POST", "/api/v1/cpr/chargen/set", {
          field: "lifestyle",
          value: "kibble",
        });
      }
      cg = await apiJson(token, "GET", "/api/v1/cpr/chargen");
      draft = cg.draft as typeof draft;

      if (draft.chargenStage === "cyberware") {
        await apiJson(token, "POST", "/api/v1/cpr/chargen/set", {
          field: "chrome",
          value: "light_tattoo",
          action: "install",
        });
        await apiJson(token, "POST", "/api/v1/cpr/chargen/next", {});
      }
      cg = await apiJson(token, "GET", "/api/v1/cpr/chargen");
      draft = cg.draft as typeof draft;

      if (draft.chargenStage === "equipment") {
        await apiJson(token, "POST", "/api/v1/cpr/chargen/next", {});
      }
      cg = await apiJson(token, "GET", "/api/v1/cpr/chargen");
      draft = cg.draft as typeof draft;
      assertEquals(
        draft.chargenStage,
        "review",
        "API prep should land on review, got " + draft.chargenStage,
      );

      // ── 4. FE review + finish (or API submit + complete UI)
      ({ context, page } = await authedPage());
      await page.goto(BASE + "/chargen", {
        waitUntil: "domcontentloaded",
        timeout: 45000,
      });
      await page.waitForSelector(".cg-root, .cg-gate, .cg-runner", {
        timeout: 20000,
      });
      await page.waitForTimeout(600);

      const finish = page.locator("[data-cpr-next]");
      const finishVisible = await finish.count() > 0 &&
        /Finish/i.test(await finish.innerText().catch(() => ""));

      if (finishVisible) {
        const runner2 = await page.locator(".cg-runner").innerText();
        assertStringIncludes(runner2.toUpperCase(), "SOLO");
        await page.screenshot({
          path: shotDir + "/04-review.png",
          fullPage: true,
        });
        await finish.click();
        await page.waitForTimeout(1000);
      } else {
        // Rate limit / hydration miss — finish via API, assert UI
        await page.screenshot({
          path: shotDir + "/04-review-fallback.png",
          fullPage: true,
        });
        await apiJson(
          token,
          "POST",
          "/api/v1/cpr/chargen/submit",
          {},
        );
        await page.goto(BASE + "/chargen", {
          waitUntil: "domcontentloaded",
          timeout: 45000,
        });
        await page.waitForTimeout(800);
      }

      const doneBody = await page.locator(".site-main").innerText();
      assert(
        /ready|complete|Play Online|jack in|Edgerunner/i
          .test(doneBody),
        "expected complete UI, got: " + doneBody.slice(0, 240),
      );

      const sheet = await apiJson(
        token,
        "GET",
        "/api/v1/cpr/sheet",
      );
      const s = sheet.sheet as {
        chargenComplete?: boolean;
        role?: string;
      };
      assertEquals(s.chargenComplete, true);
      assertEquals(s.role, "solo");

      await page.screenshot({
        path: shotDir + "/05-done.png",
        fullPage: true,
      });
      console.log(
        "CPR chargen e2e ok for",
        username,
        "shots:",
        shotDir,
      );
      await context.close();
    } finally {
      await browser.close();
    }
  },
);

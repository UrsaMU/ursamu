/**
 * Admin FE theme zip install + activate (Court package format).
 *
 *   POST /api/v1/admin/site/theme
 *     multipart: file=<zip> [&activate=true]
 *     or JSON: { zipBase64, activate? } | { activate: "<id>" }
 *   GET  /api/v1/admin/site/themes
 */

import { getAllConfig, setConfig } from "@ursamu/mush";

const JSON_HDR = {
  "Content-Type": "application/json",
  "X-Content-Type-Options": "nosniff",
};

const CONFIG_PATH = "config/config.json";
const MAX_ZIP = 20 * 1024 * 1024;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: JSON_HDR,
  });
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

async function readConfigFile(): Promise<Record<string, unknown>> {
  try {
    const text = await Deno.readTextFile(CONFIG_PATH);
    const parsed = JSON.parse(text) as unknown;
    return isPlainObject(parsed) ? parsed : {};
  } catch (e: unknown) {
    if (e instanceof Deno.errors.NotFound) return {};
    throw e;
  }
}

async function writeConfigFile(
  data: Record<string, unknown>,
): Promise<void> {
  const body = JSON.stringify(data, null, 2) + "\n";
  const tmp = `${CONFIG_PATH}.${Deno.pid}.tmp`;
  await Deno.writeTextFile(tmp, body);
  await Deno.rename(tmp, CONFIG_PATH);
}

function dotSet(
  obj: Record<string, unknown>,
  key: string,
  value: unknown,
): void {
  const parts = key.split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i]!;
    if (!isPlainObject(cur[p])) cur[p] = {};
    cur = cur[p] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]!] = value;
}

type SiteThemeMod = {
  installThemeZip: (
    zip: Uint8Array,
    opts?: { cwd?: string },
  ) => Promise<
    | { ok: true; theme: ThemeRow; path: string }
    | { ok: false; error: string }
  >;
  listAllThemes: (cwd?: string) => Promise<ThemeRow[]>;
  themeToSiteConfig: (t: ThemeRow) => Record<string, unknown>;
  readSiteConfig: (c: unknown) => Record<string, unknown>;
  applySkinDefaults: (
    c: Record<string, unknown>,
  ) => Record<string, unknown>;
  setSiteRuntime: (c: Record<string, unknown>) => void;
  getSiteRuntime?: () => {
    cfg?: { skin?: string; skinCss?: string };
    gen?: number;
  };
};

export type ThemeRow = {
  id: string;
  label: string;
  version?: string;
  source?: string;
  skinCss?: string;
  bannerHref?: string;
  bannerImage?: string;
  title?: string;
  plainBg?: boolean;
  description?: string;
};

async function loadSite(): Promise<SiteThemeMod | null> {
  // Prefer bare specifier (game import map). Fall back to explicit
  // JSR so this works when @ursamu/web is loaded from jsr.io and the
  // app map does not re-export site into the web package graph.
  let site: Partial<SiteThemeMod> | null = null;
  let lastErr: unknown = null;
  try {
    site = await import("@ursamu/site") as Partial<SiteThemeMod>;
  } catch (e: unknown) {
    lastErr = e;
    try {
      site = await import(
        "jsr:@ursamu/site@^0.1.5"
      ) as Partial<SiteThemeMod>;
      lastErr = null;
    } catch (e2: unknown) {
      lastErr = e2;
      site = null;
    }
  }
  if (!site) {
    console.warn("[web] loadSite import failed:", lastErr);
    return null;
  }
  if (
    typeof site.installThemeZip !== "function" ||
    typeof site.listAllThemes !== "function" ||
    typeof site.themeToSiteConfig !== "function"
  ) {
    console.warn(
      "[web] loadSite: @ursamu/site missing theme APIs",
      Object.keys(site).slice(0, 20),
    );
    return null;
  }
  return site as SiteThemeMod;
}

async function refreshSiteRuntime(
  file: Record<string, unknown>,
  site: SiteThemeMod,
): Promise<boolean> {
  try {
    if (
      typeof site.readSiteConfig !== "function" ||
      typeof site.setSiteRuntime !== "function"
    ) {
      return false;
    }
    let cfg = site.readSiteConfig(file);
    if (typeof site.applySkinDefaults === "function") {
      cfg = site.applySkinDefaults(cfg);
    }
    site.setSiteRuntime(cfg);
    // Confirm the live handler sees the same runtime (globalThis).
    // deno-lint-ignore no-explicit-any
    const live = (site as any).getSiteRuntime?.() as
      | { cfg?: { skin?: string; skinCss?: string } }
      | undefined;
    if (live?.cfg) {
      const wantSkin = String(
        (cfg as { skin?: string }).skin ?? "",
      );
      const got = String(live.cfg.skin ?? "");
      if (wantSkin && got && wantSkin !== got) {
        console.warn(
          "[web] theme runtime mismatch after setSiteRuntime:",
          { wantSkin, got },
        );
        return false;
      }
    }
    const skinLabel =
      (cfg as { skinCss?: string; skin?: string }).skinCss ||
      (cfg as { skin?: string }).skin ||
      "default";
    console.log(`[web] site theme live → ${skinLabel}`);
    return true;
  } catch (e: unknown) {
    console.warn("[web] theme refreshSiteRuntime:", e);
    return false;
  }
}

/** Write theme fields into config + live setConfig. */
async function applyThemeToConfig(
  theme: ThemeRow,
  site: SiteThemeMod,
): Promise<{ file: Record<string, unknown>; siteLive: boolean }> {
  const patch = site.themeToSiteConfig(theme);
  const file = await readConfigFile();

  const pairs: Array<[string, unknown]> = [
    ["plugins.site.skin", String(patch.skin ?? theme.id)],
    ["plugins.site.skinCss", String(patch.skinCss ?? "")],
    [
      "plugins.site.bannerImage",
      String(patch.bannerImage ?? ""),
    ],
  ];
  if (typeof patch.title === "string" && patch.title) {
    pairs.push(["plugins.site.title", patch.title]);
  }
  if (typeof patch.plainBg === "boolean") {
    pairs.push(["plugins.site.plainBg", patch.plainBg]);
  }
  if (typeof patch.themeDir === "string" && patch.themeDir) {
    pairs.push(["plugins.site.themeDir", patch.themeDir]);
  } else if (theme.source === "builtin") {
    // Builtin skins don't need game themeDir
    pairs.push(["plugins.site.themeDir", ""]);
  }

  for (const [path, val] of pairs) {
    dotSet(file, path, val);
    setConfig(path, val);
  }

  await writeConfigFile(file);
  const siteLive = await refreshSiteRuntime(file, site);
  return { file, siteLive };
}

function b64ToBytes(b64: string): Uint8Array | null {
  try {
    const clean = b64.replace(/\s+/g, "");
    const bin = atob(clean);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) {
      out[i] = bin.charCodeAt(i);
    }
    return out;
  } catch {
    return null;
  }
}

/** FormData file entry → Blob-like (Deno + browser). */
function asBlob(
  v: FormDataEntryValue | null,
): { size: number; arrayBuffer: () => Promise<ArrayBuffer> } | null {
  if (v == null || typeof v === "string") return null;
  // File extends Blob; avoid instanceof Blob (lib typing varies)
  const o = v as {
    size?: number;
    arrayBuffer?: () => Promise<ArrayBuffer>;
  };
  if (typeof o.arrayBuffer !== "function") return null;
  const size = typeof o.size === "number" ? o.size : 0;
  return { size, arrayBuffer: () => o.arrayBuffer!() };
}

async function readZipFromRequest(
  req: Request,
): Promise<
  | { ok: true; zip: Uint8Array; activate: boolean; activateId?: string }
  | { ok: false; error: string; status: number }
> {
  const ct = (req.headers.get("content-type") ?? "").toLowerCase();

  if (ct.includes("multipart/form-data")) {
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return { ok: false, error: "Invalid multipart body", status: 400 };
    }
    const activateRaw = form.get("activate");
    const activate = activateRaw == null ||
      String(activateRaw).toLowerCase() !== "false";
    const idField = form.get("id") ?? form.get("activateId");
    if (idField != null && String(idField).trim() && !form.get("file")) {
      return {
        ok: true,
        zip: new Uint8Array(0),
        activate: true,
        activateId: String(idField).trim().toLowerCase(),
      };
    }
    const file = form.get("file") ?? form.get("zip") ??
      form.get("theme");
    const blob = asBlob(file);
    if (!blob) {
      return {
        ok: false,
        error: "multipart field \"file\" (zip) required",
        status: 400,
      };
    }
    if (blob.size > MAX_ZIP) {
      return { ok: false, error: "Zip too large (max 20MB)", status: 400 };
    }
    if (blob.size < 22) {
      return { ok: false, error: "Not a valid zip", status: 400 };
    }
    const buf = new Uint8Array(await blob.arrayBuffer());
    return { ok: true, zip: buf, activate };
  }

  // JSON body (WS RPC or fetch)
  let body: Record<string, unknown>;
  try {
    body = await req.json() as Record<string, unknown>;
  } catch {
    return { ok: false, error: "Expected multipart or JSON", status: 400 };
  }

  // Activate existing by id only
  if (
    typeof body.activate === "string" &&
    body.activate.trim() &&
    !body.zipBase64 && !body.zip
  ) {
    return {
      ok: true,
      zip: new Uint8Array(0),
      activate: true,
      activateId: body.activate.trim().toLowerCase(),
    };
  }

  const activate = body.activate !== false;
  let zip: Uint8Array | null = null;
  if (typeof body.zipBase64 === "string") {
    zip = b64ToBytes(body.zipBase64);
    if (!zip) {
      return { ok: false, error: "Invalid zipBase64", status: 400 };
    }
  } else if (Array.isArray(body.zip)) {
    // number[] — small zips via WS
    const arr = body.zip as unknown[];
    if (arr.length > MAX_ZIP) {
      return { ok: false, error: "Zip too large", status: 400 };
    }
    zip = Uint8Array.from(arr.map((n) => Number(n) & 0xff));
  }

  if (!zip || zip.byteLength < 22) {
    return {
      ok: false,
      error:
        "Provide multipart file, zipBase64, or activate:\"theme-id\"",
      status: 400,
    };
  }
  if (zip.byteLength > MAX_ZIP) {
    return { ok: false, error: "Zip too large (max 20MB)", status: 400 };
  }
  return { ok: true, zip, activate };
}

export async function listThemesPayload(): Promise<{
  themes: ThemeRow[];
  available: boolean;
}> {
  const site = await loadSite();
  if (!site) return { themes: [], available: false };
  const themes = await site.listAllThemes(Deno.cwd());
  return { themes, available: true };
}

/**
 * Handle theme list / install routes. Returns null if path not matched.
 */
export async function handleSiteThemeRoutes(
  req: Request,
  path: string,
  method: string,
): Promise<Response | null> {
  const isThemesList =
    path === "/api/v1/admin/site/themes" ||
    path.endsWith("/admin/site/themes");
  const isThemePost =
    path === "/api/v1/admin/site/theme" ||
    path.endsWith("/admin/site/theme");

  if (isThemesList && method === "GET") {
    try {
      const { themes, available } = await listThemesPayload();
      const live = getAllConfig() as Record<string, unknown>;
      const plugs = isPlainObject(live.plugins) ? live.plugins : {};
      const siteB = isPlainObject(plugs.site) ? plugs.site : {};
      const active = String(siteB.skin ?? "default");
      return json({
        available,
        active,
        themes: themes.map((t) => ({
          ...t,
          active: t.id === active,
        })),
      });
    } catch (e: unknown) {
      return json({ error: String(e) }, 500);
    }
  }

  if (isThemePost && method === "POST") {
    const site = await loadSite();
    if (!site) {
      return json({
        error: "@ursamu/site not loaded (need installThemeZip)",
      }, 503);
    }

    const parsed = await readZipFromRequest(req);
    if (!parsed.ok) {
      return json({ error: parsed.error }, parsed.status);
    }

    // Activate existing installed/builtin theme
    if (parsed.activateId) {
      const themes = await site.listAllThemes(Deno.cwd());
      const theme = themes.find((t) => t.id === parsed.activateId);
      if (!theme) {
        return json({
          error: `Theme not found: ${parsed.activateId}`,
        }, 404);
      }
      try {
        const { siteLive } = await applyThemeToConfig(theme, site);
        // Return applied config fields (builtin clears skinCss) so
        // the admin form matches what the FE actually serves.
        const applied = site.themeToSiteConfig(theme);
        return json({
          ok: true,
          activated: true,
          theme: {
            ...theme,
            skinCss: String(applied.skinCss ?? ""),
            bannerHref: String(
              applied.bannerImage ?? theme.bannerHref ?? "",
            ),
            title: applied.title ?? theme.title,
            plainBg: applied.plainBg ?? theme.plainBg,
          },
          siteLive,
          themes: (await site.listAllThemes(Deno.cwd())).map((t) => ({
            ...t,
            active: t.id === theme.id,
          })),
        });
      } catch (e: unknown) {
        return json({ error: String(e) }, 500);
      }
    }

    const result = await site.installThemeZip(parsed.zip, {
      cwd: Deno.cwd(),
    });
    if (!result.ok) {
      return json({ error: result.error }, 400);
    }

    let siteLive = false;
    let activated = false;
    if (parsed.activate) {
      try {
        const r = await applyThemeToConfig(result.theme, site);
        siteLive = r.siteLive;
        activated = true;
      } catch (e: unknown) {
        return json({
          ok: true,
          installed: true,
          activated: false,
          theme: result.theme,
          path: result.path,
          error: `Installed but activate failed: ${e}`,
          siteLive: false,
        }, 200);
      }
    }

    return json({
      ok: true,
      installed: true,
      activated,
      theme: result.theme,
      path: result.path,
      siteLive,
      themes: (await site.listAllThemes(Deno.cwd())).map((t) => ({
        ...t,
        active: activated && t.id === result.theme.id,
      })),
    });
  }

  return null;
}

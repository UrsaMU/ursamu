import { MiddlewareHandlerContext } from "$fresh/server.ts";

interface ThemeConfig {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  surface: string;
  text: string;
  muted: string;
  glass: string;
  glassBorder: string;
  backgroundImage?: string;
}

let cachedTheme: ThemeConfig | null = null;
let lastFetch = 0;
const CACHE_DURATION = 60000; // 1 minute

export const handler = async (
  _req: Request,
  ctx: MiddlewareHandlerContext,
) => {
  // Only fetch content for page navigations or initial load to avoid excessive calls
  // However, `_app` is wrapper so passing state is fine.

  const now = Date.now();
  if (!cachedTheme || now - lastFetch > CACHE_DURATION) {
    try {
      const res = await fetch("http://localhost:4203/api/v1/config");
      if (res.ok) {
        const data = await res.json();
        if (data.theme) {
          cachedTheme = data.theme;
          lastFetch = now;
        }
      }
    } catch (e) {
      console.error("Failed to fetch theme config:", e);
      // Fallback or keep existing
    }
  }

  if (cachedTheme) {
    ctx.state.theme = cachedTheme;
  }

  return await ctx.next();
};

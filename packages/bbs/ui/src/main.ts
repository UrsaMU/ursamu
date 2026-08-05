import { createApp } from "vue";
import App from "./App.vue";
import router from "./router";

/**
 * Host owns the theme. Prefer live /admin/staff-theme.css so token
 * updates ship with @ursamu/web. Fall back to a synced vendor copy
 * when the host console is not installed.
 */
async function loadStaffTheme(): Promise<void> {
  try {
    const res = await fetch("/admin/staff-theme.css", {
      method: "GET",
      cache: "no-cache",
    });
    if (res.ok) {
      const href = "/admin/staff-theme.css";
      if (!document.querySelector(`link[href="${href}"]`)) {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = href;
        document.head.appendChild(link);
      }
      return;
    }
  } catch {
    /* offline / no host */
  }
  await import("./vendor/staff-theme.css");
}

await loadStaffTheme();
await import("./styles.css");

createApp(App).use(router).mount("#app");

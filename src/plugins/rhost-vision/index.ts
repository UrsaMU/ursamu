import type { IPlugin } from "../../@types/IPlugin.ts";
import * as dpath from "@std/path";

const plugin: IPlugin = {
  name: "rhost-vision",
  description: "Rhost-style room display — bordered headers, sectioned exits, player idle times, short descriptions",
  version: "1.0.0",
  init: async () => {
    const __dirname = dpath.dirname(dpath.fromFileUrl(import.meta.url));
    const srcLook = dpath.join(__dirname, "look.ts");
    const destLook = dpath.join(Deno.cwd(), "system", "scripts", "look.ts");
    const backupLook = dpath.join(Deno.cwd(), "system", "scripts", "look.original.ts");

    try {
      // Back up the original look.ts if no backup exists yet
      try {
        await Deno.stat(backupLook);
      } catch {
        // No backup — create one from the current look.ts
        await Deno.copyFile(destLook, backupLook);
        console.log("[rhost-vision] Backed up original look.ts → look.original.ts");
      }

      // Install the Rhost Vision look override
      await Deno.copyFile(srcLook, destLook);
      console.log("[rhost-vision] Installed Rhost Vision look override.");
    } catch (e) {
      console.error("[rhost-vision] Failed to install look override:", e);
    }

    return true;
  },
  remove: async () => {
    const destLook = dpath.join(Deno.cwd(), "system", "scripts", "look.ts");
    const backupLook = dpath.join(Deno.cwd(), "system", "scripts", "look.original.ts");

    try {
      await Deno.stat(backupLook);
      await Deno.copyFile(backupLook, destLook);
      console.log("[rhost-vision] Restored original look.ts from backup.");
    } catch {
      console.warn("[rhost-vision] No backup found — could not restore original look.ts.");
    }
  },
};

export default plugin;

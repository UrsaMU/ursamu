import type { IUrsamuSDK } from "@ursamu/mush";
import type { ILayout } from "./layouts.ts";

export function prefersWebUi(u: IUrsamuSDK): boolean {
  const client = (u as { clientType?: string }).clientType;
  return client === "web" &&
    typeof u.ui?.layout === "function";
}

export function sendCard(u: IUrsamuSDK, layout: ILayout): void {
  if (prefersWebUi(u)) {
    u.ui.layout({
      components: layout.components,
      meta: layout.meta,
    });
    return;
  }
  u.send(layout.text);
}

import {
  assertEquals,
  assertStringIncludes,
} from "jsr:@std/assert@^1.0.0";
import { patchBridgeSource } from "../scripts/patch-bridge.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("patchBridgeSource: embed → route with ?.", OPTS, () => {
  const src = `
export async function register() {
  const web = await import("@ursamu/web");
  web.registerStaffPage?.({
    id: "mytool",
    label: "My Tool",
    embed: "/admin/mytool/",
    order: 55,
  });
}
`;
  const r = patchBridgeSource(src, {
    routeName: "mytool",
    label: "My Tool",
    order: 55,
    keepEmbed: false,
  });
  assertEquals(r.changed, true);
  assertStringIncludes(r.text, 'route: "mytool"');
  assertEquals(/embed:\s*["']/.test(r.text), false);
});

Deno.test("patchBridgeSource: keep-embed", OPTS, () => {
  const src = `
  web.softRegisterStaffPage({
    id: "x",
    label: "X",
    embed: "/admin/x/",
    order: 10,
  });
`;
  const r = patchBridgeSource(src, {
    routeName: "x",
    label: "X",
    order: 10,
    keepEmbed: true,
  });
  assertEquals(r.changed, true);
  assertStringIncludes(r.text, 'route: "x"');
  assertStringIncludes(r.text, "embed:");
});

Deno.test("patchBridgeSource: already graduated", OPTS, () => {
  const src = `
  web.registerStaffPage({
    id: "y",
    label: "Y",
    route: "y",
    order: 1,
  });
`;
  const r = patchBridgeSource(src, {
    routeName: "y",
    label: "Y",
    order: 1,
    keepEmbed: false,
  });
  assertEquals(r.changed, false);
});

/**
 * Tests for admin.ts system script.
 * Covers: @boot, @toad, @newpass, @chown, @site, @reboot, @shutdown,
 * and permission enforcement.
 */
import { assertEquals, assertStringIncludes } from "@std/assert";
import { sandboxService } from "../src/services/Sandbox/SandboxService.ts";
import { dbojs, DBO } from "../src/services/Database/database.ts";
import { SDKContext } from "../src/services/Sandbox/SDKService.ts";
import { hash, compare } from "../deps.ts";

const RAW_ADMIN_SCRIPT = await Deno.readTextFile("./system/scripts/admin.ts");

/**
 * Strip imports/exports so the script runs as legacy block code in the sandbox
 * (top-level `return` is valid inside `new Function`).
 */
function wrapAdmin(extra: string): string {
  const stripped = RAW_ADMIN_SCRIPT
    .replace(/^import\s.*?;\s*$/gm, "")
    .replace(/export default/, "_adminMain =")   // assign without re-declaring
    .replace(/^export\s+/gm, "");
  return [
    "let _adminMain;",
    stripped,
    "const _sent = [];",
    "const _origSend = u.send.bind(u);",
    "u.send = (m, target, opts) => { _sent.push(m); _origSend(m, target, opts); };",
    extra,
    "await _adminMain(u);",
    "return _sent;",
  ].join("\n");
}

const SLOW = { timeout: 8000 };
const OPTS = { sanitizeResources: false, sanitizeOps: false };

async function createAdmin(id: string) {
  return dbojs.create({
    id,
    flags: "player wizard connected",
    data: { name: `Admin_${id}`, password: await hash("adminpass", 10) },
    location: "r1",
  });
}

async function createPlayer(id: string, name: string) {
  return dbojs.create({
    id,
    flags: "player connected",
    data: { name, password: await hash("pass", 10) },
    location: "r1",
  });
}

async function cleanup(...ids: string[]) {
  for (const id of ids) await dbojs.delete({ id }).catch(() => {});
}

function makeCtx(id: string, flags: string, name: string, cmd: string, args: string[]): SDKContext {
  return {
    id,
    state: {},
    me: { id, name, flags: new Set(flags.split(" ")), state: {} },
    here: { id: "r1", name: "Test Room", flags: new Set(["room"]), state: {} },
    cmd: { name: cmd, original: cmd, args, switches: [] },
    socketId: `sock-${id}`,
  };
}

// ---------------------------------------------------------------------------
// Permission
// ---------------------------------------------------------------------------

Deno.test("Admin: non-admin is denied", OPTS, async () => {
  const plr = await dbojs.create({ id: "perm_np1", flags: "player connected", data: { name: "Normie" }, location: "r1" });
  const ctx = makeCtx(plr.id, "player connected", "Normie", "@boot", ["someone"]);
  const result = await sandboxService.runScript(wrapAdmin(""), ctx, SLOW) as string[];
  assertEquals(Array.isArray(result), true);
  assertStringIncludes(result[0] ?? "", "Permission denied");
  await cleanup(plr.id);
});

// ---------------------------------------------------------------------------
// @boot
// ---------------------------------------------------------------------------

Deno.test("Admin: @boot - missing arg", OPTS, async () => {
  const adm = await createAdmin("boot_adm1");
  const ctx = makeCtx(adm.id, "player wizard", `Admin_${adm.id}`, "@boot", [""]);
  const result = await sandboxService.runScript(wrapAdmin(""), ctx, SLOW) as string[];
  assertStringIncludes(result.join(" "), "Usage");
  await cleanup(adm.id);
});

Deno.test("Admin: @boot - target not found", OPTS, async () => {
  const adm = await createAdmin("boot_adm2");
  const ctx = makeCtx(adm.id, "player wizard", `Admin_${adm.id}`, "@boot", ["NoExist99999"]);
  const result = await sandboxService.runScript(wrapAdmin(""), ctx, SLOW) as string[];
  assertStringIncludes(result.join(" "), "not found");
  await cleanup(adm.id);
});

Deno.test("Admin: @boot - cannot boot non-player", OPTS, async () => {
  const adm = await createAdmin("boot_adm3");
  const thing = await dbojs.create({ id: "thing_b1", flags: "thing", data: { name: "ABox" }, location: "r1" });
  const ctx = makeCtx(adm.id, "player wizard", `Admin_${adm.id}`, "@boot", ["ABox"]);
  const result = await sandboxService.runScript(wrapAdmin(""), ctx, SLOW) as string[];
  assertStringIncludes(result.join(" "), "only boot players");
  await cleanup(adm.id, thing.id);
});

Deno.test("Admin: @boot - cannot boot superuser", OPTS, async () => {
  const adm = await createAdmin("boot_adm4");
  const god = await dbojs.create({ id: "god_b1", flags: "player superuser", data: { name: "GodBoot" }, location: "r1" });
  const ctx = makeCtx(adm.id, "player wizard", `Admin_${adm.id}`, "@boot", ["GodBoot"]);
  const result = await sandboxService.runScript(wrapAdmin(""), ctx, SLOW) as string[];
  assertStringIncludes(result.join(" "), "cannot boot a superuser");
  await cleanup(adm.id, god.id);
});

Deno.test("Admin: @boot - boots a valid player", OPTS, async () => {
  const adm = await createAdmin("boot_adm5");
  const victim = await createPlayer("boot_vic1", "BootVictim");
  const ctx = makeCtx(adm.id, "player wizard", `Admin_${adm.id}`, "@boot", ["BootVictim"]);
  const extra = `u.sys = { ...u.sys, disconnect: async () => {} };`;
  const result = await sandboxService.runScript(wrapAdmin(extra), ctx, SLOW) as string[];
  assertStringIncludes(result.join(" "), "booted");
  await cleanup(adm.id, victim.id);
});

// ---------------------------------------------------------------------------
// @toad
// ---------------------------------------------------------------------------

Deno.test("Admin: @toad - destroys target player", OPTS, async () => {
  const adm = await createAdmin("toad_adm1");
  const victim = await createPlayer("toad_vic1", "ToadVictim");
  const ctx = makeCtx(adm.id, "player wizard", `Admin_${adm.id}`, "@toad", ["ToadVictim"]);
  const extra = `u.sys = { ...u.sys, disconnect: async () => {} };`;
  const result = await sandboxService.runScript(wrapAdmin(extra), ctx, SLOW) as string[];
  assertStringIncludes(result.join(" "), "toaded");
  const remaining = await dbojs.queryOne({ id: victim.id });
  assertEquals(remaining, false);
  await cleanup(adm.id);
});

Deno.test("Admin: @toad - cannot toad superuser", OPTS, async () => {
  const adm = await createAdmin("toad_adm2");
  const god = await dbojs.create({ id: "god_t1", flags: "player superuser", data: { name: "GodToad" }, location: "r1" });
  const ctx = makeCtx(adm.id, "player wizard", `Admin_${adm.id}`, "@toad", ["GodToad"]);
  const result = await sandboxService.runScript(wrapAdmin(""), ctx, SLOW) as string[];
  assertStringIncludes(result.join(" "), "cannot toad a superuser");
  const remaining = await dbojs.queryOne({ id: god.id });
  assertEquals(!!remaining, true);
  await cleanup(adm.id, god.id);
});

Deno.test("Admin: @toad - target not found", OPTS, async () => {
  const adm = await createAdmin("toad_adm3");
  const ctx = makeCtx(adm.id, "player wizard", `Admin_${adm.id}`, "@toad", ["NoOne"]);
  const result = await sandboxService.runScript(wrapAdmin(""), ctx, SLOW) as string[];
  assertStringIncludes(result.join(" "), "not found");
  await cleanup(adm.id);
});

// ---------------------------------------------------------------------------
// @newpass
// ---------------------------------------------------------------------------

Deno.test("Admin: @newpass - changes player password", OPTS, async () => {
  const adm = await createAdmin("np_adm1");
  const plr = await createPlayer("np_plr1", "PassVictim");
  const ctx = makeCtx(adm.id, "player wizard", `Admin_${adm.id}`, "@newpass", ["PassVictim=newSecret99"]);
  const result = await sandboxService.runScript(wrapAdmin(""), ctx, SLOW) as string[];
  assertStringIncludes(result.join(" "), "changed");
  const updated = await dbojs.queryOne({ id: plr.id });
  if (updated) {
    const matches = await compare("newSecret99", updated.data?.password as string);
    assertEquals(matches, true);
  }
  await cleanup(adm.id, plr.id);
});

Deno.test("Admin: @newpass - no equals sign sends usage", OPTS, async () => {
  const adm = await createAdmin("np_adm2");
  const ctx = makeCtx(adm.id, "player wizard", `Admin_${adm.id}`, "@newpass", ["noequalsign"]);
  const result = await sandboxService.runScript(wrapAdmin(""), ctx, SLOW) as string[];
  assertStringIncludes(result.join(" "), "Usage");
  await cleanup(adm.id);
});

Deno.test("Admin: @newpass - empty args sends usage", OPTS, async () => {
  const adm = await createAdmin("np_adm3");
  const ctx = makeCtx(adm.id, "player wizard", `Admin_${adm.id}`, "@newpass", [""]);
  const result = await sandboxService.runScript(wrapAdmin(""), ctx, SLOW) as string[];
  assertStringIncludes(result.join(" "), "Usage");
  await cleanup(adm.id);
});

Deno.test("Admin: @newpass - player not found", OPTS, async () => {
  const adm = await createAdmin("np_adm4");
  const ctx = makeCtx(adm.id, "player wizard", `Admin_${adm.id}`, "@newpass", ["Ghost=newpass"]);
  const result = await sandboxService.runScript(wrapAdmin(""), ctx, SLOW) as string[];
  assertStringIncludes(result.join(" "), "not found");
  await cleanup(adm.id);
});

// ---------------------------------------------------------------------------
// @chown
// ---------------------------------------------------------------------------

Deno.test("Admin: @chown - transfers object ownership", OPTS, async () => {
  const adm = await createAdmin("chown_adm1");
  const owner = await createPlayer("chown_own1", "NewOwner");
  const obj = await dbojs.create({ id: "chown_obj1", flags: "thing", data: { name: "TheBox", owner: adm.id }, location: "r1" });
  const ctx = makeCtx(adm.id, "player wizard", `Admin_${adm.id}`, "@chown", ["TheBox=NewOwner"]);
  const result = await sandboxService.runScript(wrapAdmin(""), ctx, SLOW) as string[];
  assertStringIncludes(result.join(" "), "changed");
  const updated = await dbojs.queryOne({ id: obj.id });
  if (updated) assertEquals(updated.data?.owner, owner.id);
  await cleanup(adm.id, owner.id, obj.id);
});

Deno.test("Admin: @chown - no equals sign sends usage", OPTS, async () => {
  const adm = await createAdmin("chown_adm2");
  const ctx = makeCtx(adm.id, "player wizard", `Admin_${adm.id}`, "@chown", ["noequal"]);
  const result = await sandboxService.runScript(wrapAdmin(""), ctx, SLOW) as string[];
  assertStringIncludes(result.join(" "), "Usage");
  await cleanup(adm.id);
});

Deno.test("Admin: @chown - object not found", OPTS, async () => {
  const adm = await createAdmin("chown_adm3");
  const ctx = makeCtx(adm.id, "player wizard", `Admin_${adm.id}`, "@chown", ["GhostThing=SomePlayer"]);
  const result = await sandboxService.runScript(wrapAdmin(""), ctx, SLOW) as string[];
  assertStringIncludes(result.join(" "), "not found");
  await cleanup(adm.id);
});

// ---------------------------------------------------------------------------
// @site
// ---------------------------------------------------------------------------

Deno.test("Admin: @site - sets config value", OPTS, async () => {
  const adm = await createAdmin("site_adm1");
  const ctx = makeCtx(adm.id, "player wizard", `Admin_${adm.id}`, "@site", ["server.motd=Welcome!"]);
  const result = await sandboxService.runScript(wrapAdmin(""), ctx, SLOW) as string[];
  assertStringIncludes(result.join(" "), "set to");
  await cleanup(adm.id);
});

Deno.test("Admin: @site - no equals sign sends usage", OPTS, async () => {
  const adm = await createAdmin("site_adm2");
  const ctx = makeCtx(adm.id, "player wizard", `Admin_${adm.id}`, "@site", ["noequal"]);
  const result = await sandboxService.runScript(wrapAdmin(""), ctx, SLOW) as string[];
  assertStringIncludes(result.join(" "), "Usage");
  await cleanup(adm.id);
});

Deno.test("Admin: @site - empty args sends usage", OPTS, async () => {
  const adm = await createAdmin("site_adm3");
  const ctx = makeCtx(adm.id, "player wizard", `Admin_${adm.id}`, "@site", [""]);
  const result = await sandboxService.runScript(wrapAdmin(""), ctx, SLOW) as string[];
  assertStringIncludes(result.join(" "), "Usage");
  await cleanup(adm.id);
});

// ---------------------------------------------------------------------------
// @reboot / @restart
// ---------------------------------------------------------------------------

Deno.test("Admin: @reboot - broadcasts and calls sys.reboot", OPTS, async () => {
  const adm = await createAdmin("reboot_adm1");
  const ctx = makeCtx(adm.id, "player wizard", `Admin_${adm.id}`, "@reboot", []);
  const extra = [
    "u.here.broadcast = (m) => { _sent.push('BROADCAST:' + m); };",
    "u.sys = { ...u.sys, reboot: async () => { _sent.push('REBOOT_CALLED'); } };",
  ].join("\n");
  const result = await sandboxService.runScript(wrapAdmin(extra), ctx, SLOW) as string[];
  assertStringIncludes(result.join(" "), "REBOOT_CALLED");
  assertStringIncludes(result.join(" "), "BROADCAST:");
  await cleanup(adm.id);
});

Deno.test("Admin: @restart - alias for reboot", OPTS, async () => {
  const adm = await createAdmin("reboot_adm2");
  const ctx = makeCtx(adm.id, "player wizard", `Admin_${adm.id}`, "@restart", []);
  const extra = [
    "u.here.broadcast = (m) => { _sent.push('BROADCAST:' + m); };",
    "u.sys = { ...u.sys, reboot: async () => { _sent.push('REBOOT_CALLED'); } };",
  ].join("\n");
  const result = await sandboxService.runScript(wrapAdmin(extra), ctx, SLOW) as string[];
  assertStringIncludes(result.join(" "), "REBOOT_CALLED");
  await cleanup(adm.id);
});

// ---------------------------------------------------------------------------
// @shutdown
// ---------------------------------------------------------------------------

Deno.test("Admin: @shutdown - broadcasts and calls sys.shutdown", OPTS, async () => {
  const adm = await createAdmin("shutdown_adm1");
  const ctx = makeCtx(adm.id, "player wizard", `Admin_${adm.id}`, "@shutdown", []);
  const extra = [
    "u.here.broadcast = (m) => { _sent.push('BROADCAST:' + m); };",
    "u.sys = { ...u.sys, shutdown: async () => { _sent.push('SHUTDOWN_CALLED'); } };",
  ].join("\n");
  const result = await sandboxService.runScript(wrapAdmin(extra), ctx, SLOW) as string[];
  assertStringIncludes(result.join(" "), "SHUTDOWN_CALLED");
  assertStringIncludes(result.join(" "), "BROADCAST:");
  await cleanup(adm.id);
});

// ---------------------------------------------------------------------------
// Unknown command
// ---------------------------------------------------------------------------

Deno.test("Admin: unknown command sends error", OPTS, async () => {
  const adm = await createAdmin("unk_adm1");
  const ctx = makeCtx(adm.id, "player wizard", `Admin_${adm.id}`, "@boguscommand", []);
  const result = await sandboxService.runScript(wrapAdmin(""), ctx, SLOW) as string[];
  assertStringIncludes(result.join(" "), "Unknown admin command");
  await cleanup(adm.id);
  await DBO.close();
});

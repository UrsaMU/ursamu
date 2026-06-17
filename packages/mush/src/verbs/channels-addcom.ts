import type { IUrsamuSDK } from "../commands/types.ts";

export async function execAddcom(u: IUrsamuSDK): Promise<void> {
  const raw = (u.cmd.original || u.cmd.name).trimStart();
  const cmd = raw.replace(/^@/, "").split(/\s/)[0].toLowerCase();
  const arg = (u.cmd.args[0] || "").trim();

  switch (cmd) {
    case "addcom":   await doAddcom(u, arg); break;
    case "delcom":   await doDelcom(u, arg); break;
    case "allcom":   await doAllcom(u); break;
    case "clearcom": await doClearcom(u); break;
    case "comtitle": await doComtitle(u, arg); break;
  }
}

async function doAddcom(u: IUrsamuSDK, arg: string) {
  const eqIdx = arg.indexOf("=");
  if (eqIdx === -1) { u.send("Usage: @addcom <alias>=<channel>"); return; }
  const alias = arg.slice(0, eqIdx).trim();
  const channel = arg.slice(eqIdx + 1).trim();
  if (!alias || !channel) { u.send("Usage: @addcom <alias>=<channel>"); return; }
  const existing = (await u.chan.list()) as Array<{ name: string }>;
  if (!existing.find((c) => c.name.toLowerCase() === channel.toLowerCase())) {
    u.send(`No channel named "${channel}".`);
    return;
  }
  await u.chan.join(channel, alias);
  u.send(`Added alias %ch${alias}%cn for channel %ch${channel}%cn.`);
}

async function doDelcom(u: IUrsamuSDK, arg: string) {
  if (!arg) { u.send("Usage: @delcom <alias>"); return; }
  await u.chan.leave(arg);
  u.send(`Removed channel alias %ch${arg}%cn.`);
}

async function doAllcom(u: IUrsamuSDK) {
  const list = (await u.chan.list()) as Array<{
    name: string; alias?: string; title?: string; active?: boolean;
  }>;
  if (!list.length) { u.send("You have no channel aliases."); return; }
  u.send("--- Your Channel Aliases ---");
  for (const entry of list) {
    const status = entry.active === false ? "%cr[off]%cn" : "%cg[on]%cn";
    const title = entry.title ? ` <${entry.title}>` : "";
    u.send(`  %ch${entry.alias || "?"}%cn → ${entry.name}${title} ${status}`);
  }
  u.send("----------------------------");
}

async function doClearcom(u: IUrsamuSDK) {
  const list = (await u.chan.list()) as Array<{ alias?: string }>;
  for (const entry of list) {
    if (entry.alias) await u.chan.leave(entry.alias);
  }
  u.send("All channel aliases removed.");
}

async function doComtitle(u: IUrsamuSDK, arg: string) {
  const eqIdx = arg.indexOf("=");
  if (eqIdx === -1) { u.send("Usage: @comtitle <alias>=<title>"); return; }
  const alias = arg.slice(0, eqIdx).trim();
  const title = arg.slice(eqIdx + 1).trim();
  if (!alias) { u.send("Usage: @comtitle <alias>=<title>"); return; }
  type ChanEntry = { id: string; channel: string; alias: string; title?: string; active: boolean };
  const channels =
    ((u.me.state as Record<string, unknown>).channels as ChanEntry[] | undefined) ?? [];
  const entry = channels.find((c: ChanEntry) => c.alias === alias);
  if (!entry) { u.send(`No channel alias "${alias}" found.`); return; }
  entry.title = title || undefined;
  await u.db.modify(u.me.id, "$set", { "data.channels": channels });
  u.send(title ? `Title on %ch${alias}%cn set to: ${title}` : `Title on %ch${alias}%cn cleared.`);
}

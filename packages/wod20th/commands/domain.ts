// commands/domain.ts -- +domain city claims and offices.

import { addCmd } from "@ursamu/mush";
import type { IUrsamuSDK } from "@ursamu/mush";
import { findById, findByPlayer, saveChar } from "../db/charDb.ts";
import {
  createDomain,
  deleteDomain,
  findAllDomains,
  findDomainByName,
  saveDomain,
  type IDomain,
} from "../db/domainDb.ts";
import { divider, footer, header } from "../core/format.ts";

function isStaff(u: IUrsamuSDK): boolean {
  return u.me.flags.has("admin") ||
    u.me.flags.has("wizard") ||
    u.me.flags.has("superuser");
}

async function renderDomain(d: IDomain): Promise<string> {
  const ruler = d.ruler ? await findById(d.ruler) : null;
  const rName = ruler
    ? (ruler.moniker || ruler.fullName || d.ruler)
    : (d.ruler || "(none)");
  const lines = [
    header(`Domain: ${d.name}`),
    `  Sect:   ${d.sect}`,
    `  Area:   ${d.area || "(unset)"}`,
    `  Ruler:  ${rName}`,
    divider("Offices"),
  ];
  if (!d.offices.length) lines.push("  (none)");
  for (const o of d.offices) {
    const c = await findById(o.charId);
    const n = c ? (c.moniker || c.fullName || o.charId) : o.charId;
    lines.push(
      `  ${String(o.label || o.office).padEnd(14)} ${n}`,
    );
  }
  if (d.notes) {
    lines.push(divider("Notes"));
    lines.push(`  ${d.notes}`);
  }
  lines.push(footer());
  return lines.join("%r");
}

addCmd({
  name: "+domain",
  pattern: /^\+domain(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Vampire",
  help: `+domain[/switch] [<args>]  -- City domains and offices.

SYNTAX
  +domain                      List domains.
  +domain/who <name>           Show a domain.
  +domain/create <name>        (Staff) Create domain (you rule).
  +domain/sect <name>=<sect>   (Staff) Set sect.
  +domain/area <name>=<text>   (Staff) Set area.
  +domain/office <dom>/<who>=<office>
                               (Staff) Appoint office.
  +domain/unoffice <dom>/<who> (Staff) Remove office.
  +domain/ruler <name>=<who>   (Staff) Set ruler.
  +domain/delete <name>        (Staff) Delete.

SEE ALSO: +help coterie, +help boon`,

  exec: async (u: IUrsamuSDK) => {
    const sw = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const arg = u.util.stripSubs(u.cmd.args[1] ?? "").trim();

    if (!sw || sw === "list") {
      const all = await findAllDomains();
      const lines = [header("Domains")];
      if (!all.length) lines.push("  (None.)");
      for (const d of all) {
        lines.push(
          `  %ch${d.name.padEnd(22)}%cn  ${d.sect.padEnd(12)}  ` +
            `${d.offices.length} office(s)`,
        );
      }
      lines.push(footer());
      u.send(lines.join("%r"));
      return;
    }

    if (sw === "who" || sw === "show") {
      if (!arg) {
        u.send("Usage: +domain/who <name>");
        return;
      }
      const d = await findDomainByName(arg);
      if (!d) {
        u.send("Domain not found.");
        return;
      }
      u.send(await renderDomain(d));
      return;
    }

    if (sw === "create") {
      if (!isStaff(u)) {
        u.send("%crPermission denied.%cn");
        return;
      }
      if (!arg || arg.length < 2) {
        u.send("Usage: +domain/create <name>");
        return;
      }
      if (await findDomainByName(arg)) {
        u.send("Domain already exists.");
        return;
      }
      const char = await findByPlayer(u.me.id);
      const d = await createDomain(arg.trim(), char?.id ?? "");
      if (char) {
        char.domainId = d.id;
        await saveChar(char);
      }
      u.send(`%cgDomain "%ch${d.name}%cn" created.%cn`);
      return;
    }

    if (sw === "sect" || sw === "area" || sw === "ruler") {
      if (!isStaff(u)) {
        u.send("%crPermission denied.%cn");
        return;
      }
      const eq = arg.indexOf("=");
      if (eq < 1) {
        u.send(`Usage: +domain/${sw} <name>=<value>`);
        return;
      }
      const name = arg.slice(0, eq).trim();
      const val = arg.slice(eq + 1).trim();
      const d = await findDomainByName(name);
      if (!d) {
        u.send("Domain not found.");
        return;
      }
      if (sw === "sect") d.sect = val.toLowerCase();
      if (sw === "area") d.area = val.slice(0, 200);
      if (sw === "ruler") {
        const t = await u.util.target(u.me, val, true);
        if (!t) {
          u.send("Ruler not found.");
          return;
        }
        const tc = await findByPlayer(t.id);
        if (!tc) {
          u.send("No character for ruler.");
          return;
        }
        d.ruler = tc.id;
        tc.domainId = d.id;
        await saveChar(tc);
      }
      await saveDomain(d);
      u.send(`Domain ${d.name} updated.`);
      return;
    }

    if (sw === "office") {
      if (!isStaff(u)) {
        u.send("%crPermission denied.%cn");
        return;
      }
      // domain/who=office
      const eq = arg.indexOf("=");
      if (eq < 1) {
        u.send("Usage: +domain/office <domain>/<who>=<office>");
        return;
      }
      const left = arg.slice(0, eq).trim();
      const office = arg.slice(eq + 1).trim().toLowerCase();
      const slash = left.indexOf("/");
      if (slash < 1 || !office) {
        u.send("Usage: +domain/office <domain>/<who>=<office>");
        return;
      }
      const dname = left.slice(0, slash).trim();
      const who = left.slice(slash + 1).trim();
      const d = await findDomainByName(dname);
      if (!d) {
        u.send("Domain not found.");
        return;
      }
      const t = await u.util.target(u.me, who, true);
      if (!t) {
        u.send("Player not found.");
        return;
      }
      const tc = await findByPlayer(t.id);
      if (!tc) {
        u.send("No character.");
        return;
      }
      d.offices = d.offices.filter((o) => o.charId !== tc.id);
      d.offices.push({ office, charId: tc.id, label: office });
      tc.domainId = d.id;
      await saveDomain(d);
      await saveChar(tc);
      u.send(
        `Appointed ${u.util.displayName(t, u.me)} as ${office} ` +
          `of ${d.name}.`,
      );
      return;
    }

    if (sw === "unoffice") {
      if (!isStaff(u)) {
        u.send("%crPermission denied.%cn");
        return;
      }
      const slash = arg.indexOf("/");
      if (slash < 1) {
        u.send("Usage: +domain/unoffice <domain>/<who>");
        return;
      }
      const d = await findDomainByName(arg.slice(0, slash).trim());
      if (!d) {
        u.send("Domain not found.");
        return;
      }
      const t = await u.util.target(u.me, arg.slice(slash + 1).trim(), true);
      if (!t) {
        u.send("Player not found.");
        return;
      }
      const tc = await findByPlayer(t.id);
      if (!tc) {
        u.send("No character.");
        return;
      }
      d.offices = d.offices.filter((o) => o.charId !== tc.id);
      await saveDomain(d);
      u.send("Office removed.");
      return;
    }

    if (sw === "delete") {
      if (!isStaff(u)) {
        u.send("%crPermission denied.%cn");
        return;
      }
      const d = await findDomainByName(arg);
      if (!d) {
        u.send("Domain not found.");
        return;
      }
      await deleteDomain(d.id);
      u.send(`Domain "${d.name}" deleted.`);
      return;
    }

    u.send(`Unknown switch /${sw}. Try +help domain.`);
  },
});

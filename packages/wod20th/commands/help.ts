// commands/help.ts -- LiberationMUSH-style +help index and topics.

import { addCmd } from "@ursamu/mush";
import type { IUrsamuSDK } from "@ursamu/mush";
import { fromFileUrl, join } from "@std/path";
import { frame } from "../core/format.ts";
import {
  renderHelpIndex,
  resolveTopicSlug,
  allTopics,
  HELP_CATALOG,
} from "../core/helpIndex.ts";

/** Absolute path to this plugin's help/ directory. */
const HELP_DIR = fromFileUrl(new URL("../help", import.meta.url));

/** Load help/<slug>.md; return null if missing. */
async function loadTopic(slug: string): Promise<string | null> {
  const safe = slug.replace(/[^a-z0-9\-_/]/gi, "");
  if (!safe || safe.includes("..")) return null;
  const path = join(HELP_DIR, `${safe}.md`);
  try {
    return await Deno.readTextFile(path);
  } catch {
    return null;
  }
}

/** Format file body for terminal. */
function formatBody(raw: string): string[] {
  const lines = raw.replace(/\r\n/g, "\n").split("\n");
  while (lines.length && lines[lines.length - 1].trim() === "") {
    lines.pop();
  }
  return lines.map((l) => (l.length ? l : " "));
}

function suggestTopics(q: string): string[] {
  const needle = q.toLowerCase();
  return allTopics()
    .filter(
      (t) =>
        t.topic.includes(needle) ||
        t.blurb.toLowerCase().includes(needle),
    )
    .slice(0, 8)
    .map((t) => t.topic);
}

/** Idempotent register (blood.ts + router.ts both import this module). */
const g = globalThis as unknown as { __wod20thHelpRegistered?: boolean };
if (!g.__wod20thHelpRegistered) {
  g.__wod20thHelpRegistered = true;

  addCmd({
    name: "+help",
    pattern: /^\+help(?:\/(\S+))?\s*(.*)/i,
    lock: "connected",
    category: "General",
    help: `+help [<topic>]  -- wod20th help (Liberation-style index).

SYNTAX
  +help                 Full topic index by category.
  +help <topic>         Show a topic (e.g. blood, vtm, pack).
  +help/index           Same as bare +help.
  +help/section <name>  One category only.

EXAMPLES
  +help
  +help vtm
  +help blood
  +help/section Vampire

SEE ALSO: help (engine), +help vtm`,

    exec: async (u: IUrsamuSDK) => {
      const sw = (u.cmd.args[0] ?? "").toLowerCase().trim();
      const arg = u.util.stripSubs(u.cmd.args[1] ?? "").trim();

      if (
        (!sw && !arg) ||
        sw === "index" ||
        sw === "list" ||
        sw === "topics" ||
        (sw === "section" && !arg)
      ) {
        u.send(renderHelpIndex());
        return;
      }

      if (sw === "section" && arg) {
        const q = arg.toLowerCase();
        const cat = HELP_CATALOG.find(
          (c) =>
            c.name.toLowerCase() === q ||
            c.name.toLowerCase().includes(q),
        );
        if (!cat) {
          u.send(
            `%crUnknown section.%cn Try +help for the full index.`,
          );
          return;
        }
        u.send(renderHelpIndex(cat.name, [cat]));
        return;
      }

      const rawTopic = arg || sw;
      const slug = resolveTopicSlug(rawTopic);
      if (!slug) {
        u.send(renderHelpIndex());
        return;
      }

      const body = await loadTopic(slug);
      if (!body) {
        const sug = suggestTopics(slug);
        const hint = sug.length
          ? `%r  Did you mean: ${sug.join(", ")}`
          : "";
        u.send(
          `%crNo help for '%ch${slug}%cn'.%cn ` +
            `Type %ch+help%cn for the index.${hint}`,
        );
        return;
      }

      u.send(frame(slug.toUpperCase(), formatBody(body)));
    },
  });
}

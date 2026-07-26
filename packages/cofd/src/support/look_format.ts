// CoFD CONFORMAT: inventory list, concealment, equip tags, NPCs.
// Fae sight uses maskName via resolveItemLookName.

import type { IUrsamuSDK, IDBObj } from "@ursamu/ursamu";
import { divider, getConfig, dbrefWithFlags } from "@ursamu/mush";
import { formatContentItems } from "./look_format_items.ts";

export { cofdDescformatHandler } from "./look_desc.ts";

const SHORTDESC_PROMPT =
  "%ch%cxUse '&short-desc me=<desc>' to set.%cn";

const ROLE_TAGS = [
  { flag: "wizard", display: "(Wizard)" },
  { flag: "superuser", display: "(Root)" },
  { flag: "admin", display: "(Admin)" },
  { flag: "staff", display: "(Staff)" },
];

/** Staff/builders see (#idFLAGS) on look names. */
function showDbref(looker: IDBObj, canEdit: boolean): boolean {
  if (canEdit) return true;
  return (
    looker.flags.has("wizard") ||
    looker.flags.has("admin") ||
    looker.flags.has("superuser") ||
    looker.flags.has("staff") ||
    looker.flags.has("storyteller") ||
    looker.flags.has("builder")
  );
}

function nameWithDbref(
  display: string,
  obj: IDBObj,
  looker: IDBObj,
  canEdit: boolean,
): string {
  if (!showDbref(looker, canEdit)) return display;
  return `${display}(${dbrefWithFlags(obj.id, obj.flags)})`;
}

const visualLen = (s: string): number =>
  s.replace(/<#[0-9a-fA-F]{6}>/g, "")
    .replace(/%c[a-zA-Z]/g, "")
    .replace(/%[nrtbR]/g, "").length;

function visualTruncate(s: string, maxLen: number): string {
  const visLen = visualLen(s);
  if (visLen <= maxLen) return s;

  const limit = Math.max(0, maxLen - 3);
  let visualCount = 0;
  let result = "";
  let i = 0;

  while (i < s.length && visualCount < limit) {
    if (s[i] === "%" && i + 1 < s.length) {
      const next = s[i + 1];
      if (/[a-zA-Z]/.test(next) || /[nrtbR]/.test(next)) {
        result += s.slice(i, i + 2);
        i += 2;
        continue;
      }
    }
    if (s[i] === "<") {
      const match = s.slice(i).match(/^<#[0-9a-fA-F]{6}>/);
      if (match) {
        result += match[0];
        i += match[0].length;
        continue;
      }
    }

    result += s[i];
    visualCount++;
    i++;
  }

  return `${result}...%cn`;
}

function coloredName(obj: IDBObj): string {
  const moniker = (obj.state?.moniker as string) || "";
  if (moniker) return moniker;

  const rawName =
    (obj.state?.name as string) || obj.name || "Unknown";
  const nameColor = (obj.state?.name_color as string) || "";
  if (nameColor && rawName.length > 0) {
    return `${nameColor}${rawName[0]}%cn%ch%cw` +
      `${rawName.slice(1)}%cn`;
  }
  return rawName;
}

function formatIdle(
  lastCommand: number | undefined,
): string {
  if (lastCommand === undefined || isNaN(lastCommand)) {
    return "%ch%cx0s%cn";
  }
  const diff = Math.floor(
    (Date.now() - lastCommand) / 1000,
  );
  if (diff <= 0) return "%ch%cx0s%cn";
  if (diff < 60) return `%cg${diff}s%cn`;
  if (diff < 600) {
    return `%cg${Math.floor(diff / 60)}m%cn`;
  }
  if (diff < 3600) {
    return `%cy${Math.floor(diff / 60)}m%cn`;
  }
  if (diff < 86400) {
    return `%cy${Math.floor(diff / 3600)}h%cn`;
  }
  return `%ch%cx${Math.floor(diff / 86400)}d%cn`;
}

function getCharShortDesc(obj: IDBObj): string {
  const cofd = obj.state?.cofd as {
    template?: string;
    formState?: { system?: string; current?: string };
    customFields?: Record<string, string>;
    hedgeState?: { inHedge?: boolean };
  } | undefined;
  if (cofd?.template?.toLowerCase() === "changeling") {
    const fs = cofd.formState;
    const fields = cofd.customFields ?? {};
    const hs = cofd.hedgeState;
    const showMien = hs?.inHedge === true ||
      (fs?.system === "mask" && fs.current === "mien");
    if (showMien) {
      const mien = fields.mien?.trim();
      if (mien) return mien;
    } else {
      const mask = fields.mask?.trim();
      if (mask) return mask;
    }
  }

  const attrs =
    (obj.state?.attributes as {
      name?: string;
      value?: string;
    }[]) || [];
  const sd = attrs.find(
    (a) =>
      a.name?.toLowerCase() === "short-desc" ||
      a.name?.toLowerCase() === "shortdesc",
  );
  return sd?.value || "";
}

function roleTag(obj: IDBObj): string {
  // Empty array is truthy — treat missing/empty as built-in defaults.
  const configured = getConfig<
    Array<{ flag: string; display: string }>
  >("plugins.globals.theme.look.roleTags");
  const tags =
    Array.isArray(configured) && configured.length > 0
      ? configured
      : ROLE_TAGS;
  for (const t of tags) {
    if (obj.flags?.has(t.flag)) return t.display;
  }
  return "";
}

/**
 * Custom CONFORMAT handler.
 * Players/NPCs vs things; concealment; maskName for non-fae.
 */
export const cofdConformatHandler = async (
  u: IUrsamuSDK,
  target: IDBObj,
  idList: string,
): Promise<string | null> => {
  const ids = idList.split(" ")
    .map((id) => id.replace("#", "").trim())
    .filter(Boolean);
  const contents = target.contents || [];
  const visibleObjs = ids
    .map((id) => contents.find((c) => c.id === id))
    .filter((o): o is IDBObj => o != null);

  const looker = u.me;

  const playersAndNpcs = visibleObjs.filter(
    (o) =>
      (o.flags.has("player") && o.flags.has("connected")) ||
      o.flags.has("npc"),
  );

  const rawItems = visibleObjs.filter(
    (o) =>
      !o.flags.has("player") &&
      !o.flags.has("npc") &&
      !o.flags.has("exit") &&
      !o.flags.has("room"),
  );

  const lines: string[] = [];

  if (playersAndNpcs.length > 0) {
    lines.push(divider("Players", "-", 78));
    for (const c of playersAndNpcs) {
      const isNpc = c.flags.has("npc");
      const cName = coloredName(c);
      const role = isNpc ? "(NPC)" : roleTag(c);
      const idle = isNpc
        ? ""
        : formatIdle(c.state?.lastCommand as number);
      const desc = getCharShortDesc(c) || SHORTDESC_PROMPT;
      const canEditChar = await u.canEdit(looker, c);
      const nameWithRef = nameWithDbref(
        cName,
        c,
        looker,
        canEditChar,
      );

      const namePad = " ".repeat(
        Math.max(1, 21 - visualLen(nameWithRef)),
      );
      const rolePad = " ".repeat(
        Math.max(1, 13 - visualLen(role)),
      );
      const idlePad = " ".repeat(
        Math.max(1, 4 - visualLen(idle)),
      );

      const prefixVisualLen = 1 +
        visualLen(nameWithRef) + namePad.length +
        visualLen(role) + rolePad.length +
        visualLen(idle) + idlePad.length;
      const maxDescLen = 78 - prefixVisualLen;
      const finalDesc = visualTruncate(desc, maxDescLen);

      lines.push(
        ` ${nameWithRef}${namePad}${role}${rolePad}` +
          `${idle}${idlePad}${finalDesc}`.replace(/\s+$/, ""),
      );
    }
  }

  const finalItems = await formatContentItems(
    u,
    looker,
    target,
    rawItems,
  );

  if (finalItems.length > 0) {
    lines.push(divider("Contents", "-", 78));
    lines.push(...finalItems);
  }

  return lines.join("\n");
};

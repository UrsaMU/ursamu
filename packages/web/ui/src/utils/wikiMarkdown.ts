/**
 * Wiki markdown → HTML (matches packages/site public FE renderer).
 * Used for staff body preview in the console editor.
 */

function esc(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function unesc(s: string): string {
  return String(s)
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&");
}

function slug(text: string): string {
  return String(text)
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function safeHref(url: string): string | null {
  const u = String(url).trim();
  if (!u) return null;
  if (/^\s*javascript:/i.test(u)) return null;
  if (/^\s*data:/i.test(u)) return null;
  return u;
}

/** Optional path → title map for [[wikilink]] labels. */
export type WikiTitleIndex = Record<string, string>;

/**
 * Escape first, then wrap markdown so captures stay safe
 * and are never double-escaped.
 */
function inlineMarkdown(
  text: string,
  wikiIndex: WikiTitleIndex = {},
): string {
  let s = esc(text);

  s = s.replace(
    /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,
    (_m, target: string, label?: string) => {
      const t = String(target).trim();
      const key = unesc(t);
      const title = wikiIndex[key];
      const lbl = label?.trim() ||
        (title ? esc(title) : t);
      return `<a href="/site/wiki/${t}">${lbl}</a>`;
    },
  );

  s = s.replace(
    /\*\*\*(.+?)\*\*\*/g,
    "<strong><em>$1</em></strong>",
  );
  s = s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/\*(.+?)\*/g, "<em>$1</em>");
  s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
  s = s.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    (_m, lbl: string, url: string) => {
      const href = safeHref(unesc(url));
      if (!href) return lbl;
      return `<a href="${esc(href)}">${lbl}</a>`;
    },
  );

  return s;
}

/**
 * Render wiki body markdown to HTML (site FE parity).
 */
export function renderWikiMarkdown(
  md: string,
  wikiIndex: WikiTitleIndex = {},
): string {
  const lines = String(md ?? "").split(/\r?\n/);
  let html = "";
  let inList = false;
  let listTag = "";
  let inPara = false;
  let inTable = false;
  let tableRows: string[][] = [];

  const closePara = () => {
    if (inPara) {
      html += "</p>\n";
      inPara = false;
    }
  };
  const closeList = () => {
    if (inList) {
      html += `</${listTag}>\n`;
      inList = false;
      listTag = "";
    }
  };
  const flushTable = () => {
    if (!tableRows.length) {
      inTable = false;
      return;
    }
    html += "<table>\n<thead>\n<tr>";
    for (const h of tableRows[0]!) {
      html += `<th>${inlineMarkdown(h, wikiIndex)}</th>`;
    }
    html += "</tr>\n</thead>\n<tbody>\n";
    for (let r = 1; r < tableRows.length; r++) {
      html += "<tr>";
      for (const cell of tableRows[r]!) {
        html += `<td>${
          inlineMarkdown(cell, wikiIndex)
        }</td>`;
      }
      html += "</tr>\n";
    }
    html += "</tbody>\n</table>\n";
    tableRows = [];
    inTable = false;
  };
  const parseRow = (line: string): string[] =>
    line
      .replace(/^\||\|$/g, "")
      .split("|")
      .map((c) => c.trim());
  const isSepRow = (line: string): boolean =>
    /^\|[\s\-:|]+\|$/.test(line.replace(/\s/g, ""));

  for (const line of lines) {
    if (/^\|/.test(line)) {
      closePara();
      closeList();
      inTable = true;
      if (!isSepRow(line)) tableRows.push(parseRow(line));
      continue;
    }
    if (inTable) flushTable();

    if (!line.trim()) {
      closePara();
      closeList();
      continue;
    }

    const hMatch = line.match(/^(#{1,6})\s+(.*)/);
    if (hMatch) {
      closePara();
      closeList();
      const level = hMatch[1]!.length;
      const hText = hMatch[2]!;
      const hId = slug(hText);
      html += `<h${level} id="${esc(hId)}">` +
        `${inlineMarkdown(hText, wikiIndex)}` +
        `</h${level}>\n`;
      continue;
    }

    if (/^[-*_]{3,}\s*$/.test(line)) {
      closePara();
      closeList();
      html += "<hr>\n";
      continue;
    }

    const bqMatch = line.match(/^>\s?(.*)/);
    if (bqMatch) {
      closePara();
      closeList();
      html += "<blockquote><p>" +
        inlineMarkdown(bqMatch[1]!, wikiIndex) +
        "</p></blockquote>\n";
      continue;
    }

    const ulMatch = line.match(/^[-*+]\s+(.*)/);
    if (ulMatch) {
      closePara();
      if (!inList || listTag !== "ul") {
        closeList();
        html += "<ul>\n";
        inList = true;
        listTag = "ul";
      }
      html += `<li>${
        inlineMarkdown(ulMatch[1]!, wikiIndex)
      }</li>\n`;
      continue;
    }

    const olMatch = line.match(/^\d+\.\s+(.*)/);
    if (olMatch) {
      closePara();
      if (!inList || listTag !== "ol") {
        closeList();
        html += "<ol>\n";
        inList = true;
        listTag = "ol";
      }
      html += `<li>${
        inlineMarkdown(olMatch[1]!, wikiIndex)
      }</li>\n`;
      continue;
    }

    closeList();
    if (!inPara) {
      html += "<p>";
      inPara = true;
    } else {
      html += " ";
    }
    html += inlineMarkdown(line, wikiIndex);
  }

  closePara();
  closeList();
  flushTable();
  return html;
}

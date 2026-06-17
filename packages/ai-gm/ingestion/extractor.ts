// ─── Book Extractor ───────────────────────────────────────────────────────────
//
// Reads PDF and plain-text/Markdown files from the books folder and produces
// an array of ITextChunk[] — overlapping section-based windows ready for
// the analyzer graph to process.

import { join } from "@std/path";
import type { ITextChunk } from "./schema.ts";

const SUPPORTED_EXTENSIONS = [".txt", ".md", ".pdf"];
const MAX_CHUNK_CHARS = 6000; // ~1500 tokens — fits comfortably in context

// ─── Public API ───────────────────────────────────────────────────────────────

export async function extractBooks(booksDir: string): Promise<{
  files: string[];
  chunks: ITextChunk[];
}> {
  const files: string[] = [];
  const chunks: ITextChunk[] = [];
  let chunkIndex = 0;

  for await (const entry of Deno.readDir(booksDir)) {
    if (!entry.isFile) continue;
    const ext = extname(entry.name).toLowerCase();
    if (!SUPPORTED_EXTENSIONS.includes(ext)) continue;

    const filePath = join(booksDir, entry.name);
    files.push(entry.name);

    const text = ext === ".pdf"
      ? await extractPdf(filePath)
      : await Deno.readTextFile(filePath);

    const fileChunks = chunkText(text, entry.name);
    for (const chunk of fileChunks) {
      chunks.push({ ...chunk, chunkIndex: chunkIndex++ });
    }
  }

  return { files, chunks };
}

// ─── PDF extraction ───────────────────────────────────────────────────────────

async function extractPdf(filePath: string): Promise<string> {
  try {
    const { extractText } = await import("unpdf");
    const bytes = await Deno.readFile(filePath);
    const { text } = await extractText(bytes, { mergePages: true });
    return text;
  } catch (err) {
    console.warn(`[GM ingestion] PDF extraction failed for ${filePath}:`, err);
    return "";
  }
}

// ─── Text chunker ─────────────────────────────────────────────────────────────
//
// Splits text on Markdown/plain-text headings first, then by character limit.
// Produces overlapping chunks so context isn't lost at boundaries.

export function chunkText(
  text: string,
  sourceFile: string,
): Omit<ITextChunk, "chunkIndex">[] {
  const sections = splitBySections(text);
  const chunks: Omit<ITextChunk, "chunkIndex">[] = [];

  for (const { heading, body } of sections) {
    if (!body.trim()) continue;

    if (body.length <= MAX_CHUNK_CHARS) {
      chunks.push({ sourceFile, section: heading, text: body.trim() });
      continue;
    }

    // Split long sections into overlapping windows
    let offset = 0;
    while (offset < body.length) {
      const slice = body.slice(offset, offset + MAX_CHUNK_CHARS);
      chunks.push({
        sourceFile,
        section: heading ? `${heading} (cont.)` : undefined,
        text: slice.trim(),
      });
      // 20% overlap
      offset += Math.floor(MAX_CHUNK_CHARS * 0.8);
    }
  }

  return chunks;
}

// ─── Section splitter ────────────────────────────────────────────────────────

const HEADING_RE = /^(#{1,3}\s+.+|[A-Z][A-Z ]{4,}:?\s*$)/m;

export function splitBySections(
  text: string,
): { heading?: string; body: string }[] {
  const lines = text.split("\n");
  const sections: { heading?: string; body: string }[] = [];
  let currentHeading: string | undefined;
  let currentLines: string[] = [];

  for (const line of lines) {
    if (HEADING_RE.test(line) && line.trim().length > 0) {
      if (currentLines.length > 0) {
        sections.push({
          heading: currentHeading,
          body: currentLines.join("\n"),
        });
      }
      currentHeading = line.trim();
      currentLines = [];
    } else {
      currentLines.push(line);
    }
  }

  if (currentLines.length > 0) {
    sections.push({ heading: currentHeading, body: currentLines.join("\n") });
  }

  // Fallback: if no sections detected, treat entire text as one section
  if (sections.length === 0) {
    sections.push({ body: text });
  }

  return sections;
}

// ─── Util ─────────────────────────────────────────────────────────────────────

function extname(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot >= 0 ? filename.slice(dot) : "";
}

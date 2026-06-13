// ─── Campaign Journal ─────────────────────────────────────────────────────────
//
// Generates and stores session summary journal entries.
// Each entry is an AI-written recap of a session's exchanges.
// Entries can be exported as plain text or posted to Discord.

import { DBO } from "ursamu";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { nanoid } from "../ingestion/util.ts";

// ─── Schema ───────────────────────────────────────────────────────────────────

export interface IJournalEntry {
  id: string;
  sessionId: string;
  sessionLabel: string;
  title: string;
  body: string; // AI-written recap, plain text
  participants: string[]; // playerIds who contributed
  createdAt: number;
}

export const gmJournal = new DBO<IJournalEntry>("server.gm.journal");

// ─── Generate a journal entry from session exchanges ─────────────────────────

export async function generateJournalEntry(
  model: ChatGoogleGenerativeAI,
  sessionLabel: string,
  sessionId: string,
  exchanges: Array<{ input: string; output: string; playerName?: string }>,
  participants: string[],
): Promise<IJournalEntry> {
  const transcript = exchanges
    .map((e) => {
      const who = e.playerName ? `[${e.playerName}]` : "[Player]";
      return `${who}: ${e.input}\n[GM]: ${e.output}`;
    })
    .join("\n\n");

  const summary = await summarize(model, sessionLabel, transcript);

  const entry: IJournalEntry = {
    id: nanoid(),
    sessionId,
    sessionLabel,
    title: `Session: ${sessionLabel}`,
    body: summary,
    participants,
    createdAt: Date.now(),
  };

  await gmJournal.create(entry as Parameters<typeof gmJournal.create>[0]);
  return entry;
}

async function summarize(
  model: ChatGoogleGenerativeAI,
  sessionLabel: string,
  transcript: string,
): Promise<string> {
  const LIMIT = 12000; // keep within context
  const excerpt = transcript.length > LIMIT
    ? transcript.slice(0, LIMIT) + "\n...[truncated]"
    : transcript;

  try {
    const response = await model.invoke([
      new SystemMessage(
        "You are a campaign journal writer for a tabletop RPG. " +
          "Write a compelling, atmospheric session recap in 2-4 paragraphs. " +
          "Use present tense, second person where natural, pure ASCII only. " +
          "Focus on story beats, character moments, and consequences.",
      ),
      new HumanMessage(
        `Session: "${sessionLabel}"\n\nTranscript:\n${excerpt}\n\nWrite the journal entry:`,
      ),
    ]);
    const text = typeof response.content === "string" ? response.content : "";
    return text.trim() || fallbackSummary(sessionLabel, excerpt);
  } catch {
    return fallbackSummary(sessionLabel, excerpt);
  }
}

function fallbackSummary(label: string, _transcript: string): string {
  return `Session "${label}" concluded. The story continues.`;
}

// ─── Retrieval ────────────────────────────────────────────────────────────────

export async function getJournalEntries(limit = 10): Promise<IJournalEntry[]> {
  const all = await gmJournal.all() as IJournalEntry[];
  return all.sort((a, b) => b.createdAt - a.createdAt).slice(0, limit);
}

export async function getJournalEntry(
  id: string,
): Promise<IJournalEntry | null> {
  return (await gmJournal.queryOne(
    { id } as Parameters<typeof gmJournal.queryOne>[0],
  )) as IJournalEntry | null;
}

/** Format a journal entry as plain ASCII text for in-game display. */
export function formatJournalEntry(entry: IJournalEntry): string {
  const date = new Date(entry.createdAt).toISOString().slice(0, 10);
  return [
    `--- ${entry.title} (${date}) ---`,
    ``,
    entry.body,
    ``,
    `Participants: ${entry.participants.join(", ") || "unknown"}`,
  ].join("\n");
}

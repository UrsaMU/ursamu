import { DBO } from "../../services/Database/database.ts";

// ─── types ────────────────────────────────────────────────────────────────────

export interface INote {
  id: string;         // unique ID
  author: string;     // player ID
  authorName: string; // cached display name
  text: string;
  createdAt: number;  // ms timestamp
}

// ─── database ────────────────────────────────────────────────────────────────

export const notes = new DBO<INote>("server.example-notes");

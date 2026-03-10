import type { IEvent } from "../../@types/IEvent.ts";
import { DBO } from "./database.ts";

export * from "./database.ts";
export const events = new DBO<IEvent>("server.events");

import type { IEvent } from "../../@types/IEvent.ts";
import type { IChanMessage } from "../../@types/Channels.ts";
import { DBO } from "./database.ts";

export * from "./database.ts";
export const events = new DBO<IEvent>("server.events");
export const chanHistory = new DBO<IChanMessage>("server.chan_history");

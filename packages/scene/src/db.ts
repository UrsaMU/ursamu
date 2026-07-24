import { DBO } from "@ursamu/mush";
import type { IScene } from "./types.ts";

export const scenes = new DBO<IScene>("server.scenes");

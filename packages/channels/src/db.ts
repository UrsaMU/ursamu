/** Shared channel DBO accessors. */

import { DBO, getConfig } from "@ursamu/mush";
import type { IChannel, IChanMessage } from "./types.ts";

export function chansDb(): DBO<IChannel> {
  return new DBO<IChannel>(() =>
    getConfig<string>("plugins.channels.db", "server.chans")
  );
}

export function historyDb(): DBO<IChanMessage> {
  return new DBO<IChanMessage>(() =>
    getConfig<string>(
      "plugins.channels.historyDb",
      "server.chan_history",
    )
  );
}

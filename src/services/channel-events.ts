// ─── channel event bus ────────────────────────────────────────────────────────
// Plugins and services can subscribe to channel talk events without modifying
// the core channel handler directly.

export type ChannelEventMap = {
  /** A player said/emoted/posed on a channel. `message` is the formatted string
   *  (includes player name + "says, …" etc.) without the channel header. */
  "channel:message": (args: {
    channelName: string;
    senderId:    string;
    senderName:  string;
    message:     string;
  }) => void | Promise<void>;
};

type HandlerList = { [K in keyof ChannelEventMap]: ChannelEventMap[K][] };

const _handlers: HandlerList = {
  "channel:message": [],
};

export const channelEvents = {
  on<K extends keyof ChannelEventMap>(event: K, handler: ChannelEventMap[K]): void {
    (_handlers[event] as ChannelEventMap[K][]).push(handler);
  },

  off<K extends keyof ChannelEventMap>(event: K, handler: ChannelEventMap[K]): void {
    const list = _handlers[event] as ChannelEventMap[K][];
    const idx = list.indexOf(handler);
    if (idx !== -1) list.splice(idx, 1);
  },

  async emit<K extends keyof ChannelEventMap>(
    event: K,
    ...args: Parameters<ChannelEventMap[K]>
  ): Promise<void> {
    for (const handler of [...(_handlers[event] as ((...a: Parameters<ChannelEventMap[K]>) => void | Promise<void>)[])]) {
      try {
        await (handler as (...a: Parameters<ChannelEventMap[K]>) => void | Promise<void>)(...args);
      } catch (e) {
        console.error(`[channel-events] Uncaught error in handler for "${event}":`, e);
      }
    }
  },
};

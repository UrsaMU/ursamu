export type ChannelEventMap = {
  /** A player said/emoted/posed on a channel. `message` is the
   *  formatted string (includes player name + "says, …" etc.)
   *  without the channel header. */
  "channel:message": (args: {
    channelName: string;
    senderId: string;
    senderName: string;
    message: string;
    /**
     * Origin of the event. Discord bridge sets "discord" so outbound
     * webhooks can skip and avoid echo loops. Defaults to "game".
     */
    source?: "game" | "discord";
  }) => void | Promise<void>;
};

type HandlerList = { [K in keyof ChannelEventMap]: ChannelEventMap[K][] };

const _handlers: HandlerList = {
  "channel:message": [],
};

export interface IChannelEvents {
  on<K extends keyof ChannelEventMap>(
    event: K,
    handler: ChannelEventMap[K],
  ): void;
  off<K extends keyof ChannelEventMap>(
    event: K,
    handler: ChannelEventMap[K],
  ): void;
  emit<K extends keyof ChannelEventMap>(
    event: K,
    ...args: Parameters<ChannelEventMap[K]>
  ): Promise<void>;
}

export const channelEvents: IChannelEvents = {
  on<K extends keyof ChannelEventMap>(
    event: K,
    handler: ChannelEventMap[K],
  ): void {
    const list = _handlers[event] as ChannelEventMap[K][];
    if (!list.includes(handler)) list.push(handler);
  },

  off<K extends keyof ChannelEventMap>(
    event: K,
    handler: ChannelEventMap[K],
  ): void {
    const list = _handlers[event] as ChannelEventMap[K][];
    const idx = list.indexOf(handler);
    if (idx !== -1) list.splice(idx, 1);
  },

  async emit<K extends keyof ChannelEventMap>(
    event: K,
    ...args: Parameters<ChannelEventMap[K]>
  ): Promise<void> {
    const list = _handlers[event] as ((
      ...a: Parameters<ChannelEventMap[K]>
    ) => void | Promise<void>)[];
    for (const handler of [...list]) {
      try {
        await (handler as (
          ...a: Parameters<ChannelEventMap[K]>
        ) => void | Promise<void>)(...args);
      } catch (e) {
        console.error(
          `[channel-events] Uncaught error in handler for "${event}":`,
          e,
        );
      }
    }
  },
};

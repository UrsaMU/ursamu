
import { discord } from "../../../deps.ts";
import { getConfig } from "../Config/mod.ts";
import { send } from "../broadcast/index.ts";
import { dbojs } from "../Database/index.ts";
import type { IChanEntry } from "../../@types/Channels.ts";

export class DiscordService {
  private static instance: DiscordService;
  // deno-lint-ignore no-explicit-any
  private bot: any;
  private token: string = "";
  private guildId: string = "";
  private channelMap: Record<string, string> = {}; // discordId -> gameChanId
  private gameToDiscordMap: Record<string, string> = {}; // gameChanId -> discordId
  private connected = false;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;

  private constructor() {}

  static getInstance(): DiscordService {
    if (!DiscordService.instance) {
      DiscordService.instance = new DiscordService();
    }
    return DiscordService.instance;
  }

  async init() {
    // Idempotent: clear maps and cancel any pending reconnect on re-init
    if (this.reconnectTimer !== undefined) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
    this.channelMap = {};
    this.gameToDiscordMap = {};
    this.connected = false;

    // deno-lint-ignore no-explicit-any
    const conf = getConfig("discord") as any;
    if (!conf || !conf.token) {
        console.log("Discord Bridge: No token configured, skipping.");
        return;
    }

    this.token = conf.token;
    this.guildId = conf.guildId || "";
    const channels = conf.channels || {};

    // Reverse map for lookup
    for (const [gameChan, discordId] of Object.entries(channels)) {
        this.gameToDiscordMap[gameChan] = discordId as string;
        this.channelMap[discordId as string] = gameChan;
    }

    this.bot = discord.createBot({
      token: this.token,
      intents: discord.Intents.Guilds | discord.Intents.GuildMessages | discord.Intents.MessageContent,
      events: {
        ready: () => {
          console.log("Discord Bridge: Connected!");
          this.connected = true;
          this.reconnectAttempts = 0;
        },
        messageCreate: (_bot, message) => {
           this.handleMessage(message);
        }
      }
    });

    // Start bot without awaiting to avoid blocking the main server loop
    discord.startBot(this.bot).catch((e: Error) => {
        console.error("Discord Bridge: Connection lost:", e);
        this.scheduleReconnect();
    });
  }

  private scheduleReconnect() {
    this.connected = false;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 60_000);
    this.reconnectAttempts++;
    console.log(`Discord Bridge: Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})...`);
    this.reconnectTimer = setTimeout(() => this.init(), delay);
  }

  // deno-lint-ignore no-explicit-any
  private async handleMessage(message: any) {
      // Ignore bot messages
      if (message.isBot) return;

      const channelId = message.channelId.toString();
      const gameChan = this.channelMap[channelId];
      if (!gameChan) return;

      const sender = message.member?.nick || message.author.username;
      const content = message.content;
      const formattedMsg = `[Discord] %ch${sender}%cn: ${content}`;

      // Find all players subscribed to this game channel and send to their IDs
      const allPlayers = await dbojs.query({ flags: /player/i });
      const subscribers = allPlayers
        .filter((p) => {
          const chans = p.data?.channels as IChanEntry[] | undefined;
          return chans?.some((c) => c.channel === gameChan && c.active);
        })
        .map((p) => p.id);

      if (subscribers.length > 0) {
        send(subscribers, formattedMsg, {});
      }
  }

  async sendToDiscord(gameChan: string, sender: string, message: string) {
      if (!this.connected) return;
      
      const discordId = this.gameToDiscordMap[gameChan];
      if (discordId) {
          try {
             await this.bot.helpers.sendMessage(discordId, {
                 content: `**${sender}**: ${message}`
             });
          } catch (e) {
              console.error("Discord Send Error:", e);
          }
      }
  }
}

export const discordBridge = DiscordService.getInstance();

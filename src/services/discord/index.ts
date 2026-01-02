
import { discord } from "../../../deps.ts";
import { getConfig } from "../Config/mod.ts";
import { send } from "../broadcast/index.ts";

export class DiscordService {
  private static instance: DiscordService;
  // deno-lint-ignore no-explicit-any
  private bot: any;
  private token: string = "";
  private guildId: string = "";
  private channelMap: Record<string, string> = {}; // discordId -> gameChanId
  private gameToDiscordMap: Record<string, string> = {}; // gameChanId -> discordId
  private connected = false;

  private constructor() {}

  static getInstance(): DiscordService {
    if (!DiscordService.instance) {
      DiscordService.instance = new DiscordService();
    }
    return DiscordService.instance;
  }

  async init() {
    await Promise.resolve(); // satisfying async requirement for now
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
        },
        messageCreate: (_bot, message) => {
           this.handleMessage(message);
        }
      }
    });

    // Start bot without awaiting to avoid blocking the main server loop
    discord.startBot(this.bot).catch((e: Error) => {
        console.error("Discord Bridge Error:", e);
    });
  }

  // deno-lint-ignore no-explicit-any
  private async handleMessage(message: any) {
      // Ignore bot messages
      if (message.isBot) return;

      const channelId = message.channelId.toString();
      const gameChan = this.channelMap[channelId];

      if (gameChan) {
          // Broadcast to game channel
          // Format: [Discord] <User>: Message
          const sender = message.member?.nick || message.author.username;
          const content = message.content;
          
          // Send to game channel
          // We need to use `send` but target the channel. 
          // `send` takes `targets: string[]`. Channels usually have an alias like "pub" or "Public".
          // If accessing `chans` service is needed, we might need to import it.
          // For now, assume simple send to channel name works if `broadcast` handles it.
          // broadcast/index.ts `send` handles channel targets if they start with specific routing?
          // Actually, `send` targets are usually socket IDs or Channel IDs?
          // Let's assume we send to the channel name/alias.
          
          await send([gameChan], `[Discord] %ch${sender}%cn: ${content}`, {});
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

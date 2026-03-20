import { startTelnetServer } from "./services/telnet/telnet.ts";

// Start the telnet server — welcomeFile is read from config (game.text.connect)
try {
  await startTelnetServer();
  console.log("Telnet server is running!");
} catch (err) {
  console.error("Failed to start telnet server:", err instanceof Error ? err.message : String(err));
  Deno.exit(1);
}

import { startTelnetServer } from "./services/telnet/telnet.ts";

// Start the telnet server with the correct welcome file path
try {
  startTelnetServer({
    welcomeFile: "text/default_connect.txt"
  });
  console.log("Telnet server is running!");
} catch (err) {
  console.error("Failed to start telnet server:", err instanceof Error ? err.message : String(err));
  Deno.exit(1);
}

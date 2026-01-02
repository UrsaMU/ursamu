import { startTelnetServer } from "./services/telnet/telnet.ts";

// Start the telnet server with the correct welcome file path
startTelnetServer({
  welcomeFile: "text/default_connect.txt"
});

console.log("Telnet server is running!");

// Bridge: protocol utilities live in @ursamu/core.
// startTelnetServer (full connection handler) remains in telnet.ts.
export { parseNawsBytes, stripIacBytes, accumulateNaws } from "@ursamu/core";
export { startTelnetServer, MAX_MSG_BUFFER_SIZE } from "./telnet.ts";

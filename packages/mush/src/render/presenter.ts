import type { IState } from "./types.ts";
import parser, { resetJsCallCount } from "./parser.ts";

export class Presenter {
  static render(state: IState, clientType: "telnet" | "web" = "telnet"): string | object {
    if (clientType === "web") return state;

    resetJsCallCount();
    let raw = "";
    if (state.msg) raw += state.msg + "\r\n";
    if (state.room) {
      raw += `\r\n%ch%cc${state.room.name}%cn\r\n`;
      raw += `${state.room.desc}\r\n`;
      if (state.room.exits.length) {
        raw += `\r\n%ch%cyObvious Exits:%cn ${state.room.exits.join(", ")}\r\n`;
      }
    }
    return parser.substitute("telnet", raw);
  }
}

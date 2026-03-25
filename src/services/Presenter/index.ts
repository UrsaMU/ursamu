
import type { IState } from "../../interfaces/IMessage.ts";
import parser from "../parser/parser.ts";

export class Presenter {
    static render(state: IState, clientType: "telnet" | "web" = "telnet"): string | object {
        if (clientType === "web") {
            return state;
        }

        // Default to Telnet (ANSI)
        // Accumulate raw MUSH markup first, then substitute the entire string
        // in one pass so that every section (msg, room, exits) is converted.
        let raw = "";

        if (state.msg) {
            raw += state.msg + "\r\n";
        }

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

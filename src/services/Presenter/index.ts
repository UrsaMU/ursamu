
import type { IState } from "../../interfaces/IMessage.ts";
import parser from "../parser/parser.ts";

export class Presenter {
    static render(state: IState, clientType: "telnet" | "web" = "telnet"): string | object {
        if (clientType === "web") {
            return state;
        }

        // Default to Telnet (ANSI)
        let output = "";

        if (state.msg) {
            output += parser.substitute("telnet", state.msg) + "\r\n";
        }

        if (state.room) {
            output += `\r\n%ch%cc${state.room.name}%cn\r\n`;
            output += `${state.room.desc}\r\n`;

            if (state.room.exits.length) {
                output += `\r\n%ch%cyObvious Exits:%cn ${state.room.exits.join(", ")}\r\n`;
            }
        }

        return output;
    }
}

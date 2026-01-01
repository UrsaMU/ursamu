import { IContext } from "../../@types/IContext.ts";
import { send, broadcast } from "../broadcast/index.ts";

export const createScriptContext = (ctx: IContext) => {
    return {
        me: {
            id: ctx.socket.cid,
            name: () => {
                // Fetch name if needed, or just return basic info
                return "Player";
            }
        },
        game: {
            say: (msg: string) => {
                // Simple wrapper around send/broadcast
                // For now, echo back to user
                if (ctx.socket.cid) {
                    send([ctx.socket.cid], msg);
                }
            },
            emit: (msg: string) => {
                broadcast(msg);
            }
        }
    };
};

import { IChanEntry } from "../../@types/Channels.ts";
import { IContext } from "../../@types/IContext.ts";
import { moniker } from "../../utils/moniker.ts";
import { chans, dbojs } from "../Database";
import { send } from "../broadcast";
import { flags } from "../flags/flags.ts";
import { force } from "./force.ts";

export const matchChannel = async (ctx: IContext) => {
  if (ctx.socket.cid) {
    const en = await dbojs.findOne({ id: ctx.socket.cid });

    if (!en) return;
    const parts = ctx.msg?.split(" ") || [];
    const trig = parts[0];
    let msg = parts.slice(1).join(" ").trim();
    const match = msg?.match(/^(:|;)?(.*)$/i);

    const chan = en.data?.channels?.find((c: IChanEntry) => c.alias === trig);
    const channel = await chans.findOne({ name: chan?.channel });

    if (match) {
      if (!flags.check(en.flags || "", channel?.lock || "")) return false;
      if (match[1] === ":") {
        msg = `${chan?.title ? chan?.title + " " : ""}${
          chan?.mask ? chan.mask : moniker(en)
        } ${match[2]}`;
      } else if (match[1] === ";") {
        msg = `${chan?.title ? chan?.title + " " : ""}${
          chan?.mask ? chan.mask : moniker(en)
        }${match[2]}`;
      } else if (msg.toLowerCase() === "on" && chan?.active === false) {
        chan.active = true;
        ctx.socket.join(chan.channel);
        await dbojs.update({ id: en.id }, en);
        force(ctx, `${chan.alias} :has joined the channel.`);
        send([ctx.socket.id], `You have joined channel ${chan.channel}.`, {});
        return true;
      } else if (msg.toLowerCase() === "off" && chan?.active === true) {
        await force(ctx, `${chan.alias} :has left the channel.`);
        chan.active = false;
        ctx.socket.leave(chan.channel);
        await dbojs.update({ id: en.id }, en);
        send([ctx.socket.id], `You have left channel ${chan.channel}.`, {});
        return true;
      } else {
        msg = `${chan?.title || ""}${
          chan?.mask ? chan.mask : moniker(en)
        } says, "${msg}"`;
      }

      if (channel && chan?.active) {
        send([channel.name], `${channel.header} ${msg}`, {});
        return true;
      }
    }
    return false;
  }
};

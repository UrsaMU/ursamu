import { Obj, addCmd } from "../services";

// +stats <stat> = <value>

export default () => {
  addCmd({
    name: "stats",
    pattern: /^[@\+]?stats\s+(.*)$/i,
    lock: "connected !approved|admin+",
    exec: async (ctx) => {
      const en = await Obj.get(ctx.socket.cid);
      if (!en) return;

      const trigger = ctx.msg?.trim().toLowerCase() || "";

      switch (trigger) {
        case trigger:
      }
    },
  });
};

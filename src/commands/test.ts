import { addCmd } from "../services/commands";

export default () =>
  addCmd({
    name: "test",
    pattern: /^test/,
    exec: (ctx) => {
      ctx.socket.send("test!! One two three!");
    },
  });

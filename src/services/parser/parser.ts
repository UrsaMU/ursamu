import { Parser } from "../../../deps.ts";
import { center, ljust, rjust } from "../../utils/format.ts";
import { substitution } from "../../utils/substitution.ts";

const parser = new Parser();

parser.addSubs(
  "telnet",
  { before: /%r/g, after: "\n" },
  { before: /%b/g, after: " ", strip: " " },
  { before: /%t/g, after: "\t" },
  //color
  { before: /%[cx]n/g, after: "\x1b[0m", strip: "" },
  { before: /%[cx]x/g, after: "\x1b[30m", strip: "" },
  { before: /%[cx]r/g, after: "\x1b[31m", strip: "" },
  { before: /%[cx]g/g, after: "\x1b[32m", strip: "" },
  { before: /%[cx]y/g, after: "\x1b[33m", strip: "" },
  { before: /%[cx]b/g, after: "\x1b[34m", strip: "" },
  { before: /%[cx]m/g, after: "\x1b[35m", strip: "" },
  { before: /%[cx]c/g, after: "\x1b[36m", strip: "" },
  { before: /%[cx]w/g, after: "\x1b[37m", strip: "" },
  { before: /%[cx]h/g, after: "\x1b[1m", strip: "" },
  { before: /%[cx]u/g, after: "\x1b[4m", strip: "" },
  { before: /%[cx]i/g, after: "\x1b[3m", strip: "" },
  { before: /%[cx]#(\d+)/g, after: "\x1b[38;5;$1m", strip: "" },
);

parser.addSubs(
  "pre",
  { before: /%\[/g, after: "&lb;", strip: " " },
  { before: /%\]/g, after: "&rb;", strip: " " },
  { before: /%\(/g, after: "&lp;", strip: " " },
  { before: /%\)/g, after: "&rp;", strip: " " },
);

parser.addSubs(
  "post",
  { before: /&lb;/g, after: "[", strip: " " },
  { before: /&rb;/g, after: "]", strip: " " },
  { before: /&lp;/g, after: "(", strip: " " },
  { before: /&rp;/g, after: ")", strip: " " },
);

parser.addSubs(
  "html",
  { before: /%r/g, after: "<br />" },
  { before: /%b/g, after: "&nbsp;", strip: " " },
  { before: /%t/g, after: "&nbsp;&nbsp;&nbsp;&nbsp;" },
  //color
  {
    before: /%[cx]n/g,
    after: "<span style='color: inherit'></b></i>",
    strip: "",
  },
  { before: /%[cx]x/g, after: "<span style='color: grey'>", strip: "" },
  { before: /%[cx]r/g, after: "<span style='color: red'>", strip: "" },
  { before: /%[cx]g/g, after: "<span style='color: green'>", strip: "" },
  { before: /%[cx]y/g, after: "<span style='color: yellow'>", strip: "" },
  { before: /%[cx]b/g, after: "<span style='color: blue'>", strip: "" },
  { before: /%[cx]m/g, after: "<span style='color: magenta'>", strip: "" },
  { before: /%[cx]c/g, after: "<span style='color: cyan'>", strip: "" },
  { before: /%[cx]w/g, after: "<span style='color: white'>", strip: "" },
  { before: /%[cx]h/g, after: "<b>", strip: "" },
  {
    before: /%[cx]u/g,
    after: "<span style='border-bottom: 1px solid'>",
    strip: "",
  },
  { before: /%[cx]i/g, after: "<i>", strip: "" },
  { before: /%[cx]#(\d+)/g, after: "\x1b[38;5;$1m", strip: "" },
);

parser.addSubs(
  "markdown",
  { before: /#{1,6}\s+(.*)/g, after: "%ch%cu$1%cn" },
  { before: /\`([^\`]+)\`/g, after: "%cc%cu$1%cn" },
  { before: /\*\*([^\*]+)\*\*/g, after: "%ch$1%cn" },
  { before: /_([^_]+)_/g, after: "%ci$1%cn" },
);

parser.add("center", async (args, _, scope) => {
  const [text, width = 78, fill = " "] = args;
  const msg = substitution(text, scope);
  return center(msg, width, fill);
});

parser.add("ljust", async (args) => {
  const [text, width = 78, fill = " "] = args;
  return ljust(text, width, fill);
});

parser.add("rjust", async (args) => {
  const [text, width = 78, fill = " "] = args;
  return rjust(text, width, fill);
});

parser.add("iter", async (args, data, scope) => {
  let [list, action, sep, outSep] = args;
  list = substitution(list, scope);
  action = substitution(action, scope);
  list = list.split(sep || " ");
  console.log(list, action, sep, outSep);
  const output = [];
  console.log("Action: ", action);
  for (const item of list) {
    scope["##"] = item;
    const msg = substitution(action, scope);
    output.push(await parse(msg, data, scope));
  }

  return output.join(outSep || " ");
});

parser.add("add", async (args) => args.reduce((a, b) => +a + +b, 0));

export default parser;
export const parse = async (
  msg: string,
  data: any,
  scope: { [key: string]: any },
) => {
  const run = await parser.run({ msg, data, scope }) || "";
  if (run === msg || !run) {
    return await parser.run({ msg: `[${msg}]`, data, scope });
  }

  return msg;
};

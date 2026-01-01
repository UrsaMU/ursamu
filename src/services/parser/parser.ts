import { Parser } from "../../../deps.ts";
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
  { before: /%[cx]#(\d+)/g, after: "\x1b[38;5;$1m", strip: "" }
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
  { before: /%[cx]#(\d+)/g, after: "\x1b[38;5;$1m", strip: "" }
);

export default parser;

import { Parser } from "@ursamu/parser";
import { ljust, target } from "../../utils";
import { Obj } from "../DBObjs";
import { IDBOBJ } from "../../@types";

// Map of color names to 256-color codes
const colorMap: { [key: string]: number } = {
  // Standard colors
  black: 0,
  maroon: 1,
  green: 2,
  olive: 3,
  navy: 4,
  purple: 5,
  teal: 6,
  silver: 7,
  grey: 8,
  red: 9,
  lime: 10,
  yellow: 11,
  blue: 12,
  magenta: 13,
  cyan: 14,
  white: 15,
  // Additional colors
  orange: 214,
  pink: 218,
  brown: 130,
  violet: 93,
  gold: 220,
  coral: 209,
  indigo: 54,
  crimson: 160,
  turquoise: 45,
  salmon: 209,
  plum: 96,
  khaki: 228,
  sienna: 130,
  chocolate: 166,
  seagreen: 29,
  royalblue: 62,
  steelblue: 67,
  skyblue: 117,
  // Dark variants
  darkred: 88,
  darkgreen: 22,
  darkblue: 18,
  darkcyan: 30,
  darkmagenta: 90,
  darkyellow: 136,
  darkgrey: 240,
  // Light variants
  lightred: 203,
  lightgreen: 157,
  lightblue: 153,
  lightcyan: 159,
  lightmagenta: 207,
  lightyellow: 229,
  lightgrey: 252
};

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
  // Extended color support with both % and $ prefix
  { 
    before: /%c<#([0-9A-Fa-f]{6})>/g, 
    after: (match, hex) => {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      return `\x1b[38;2;${r};${g};${b}m`;
    }, 
    strip: "" 
  },
  // 256 color support with names or numbers, both % and $ prefix
  { 
    before: /%c<(\d{1,3}|[a-zA-Z]+)>/g, 
    after: (match, color) => {
      const colorCode = isNaN(color as any) ? colorMap[color.toLowerCase()] || 15 : parseInt(color);
      return `\x1b[38;5;${colorCode}m`;
    }, 
    strip: "" 
  }
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
  { 
    before: /%c<#([0-9A-Fa-f]{6})>/g, 
    after: (match, hex) => `<span style='color: #${hex}'>`, 
    strip: "" 
  },
  // 256 color support with names or numbers
  { 
    before: /%c<(\d{1,3}|[a-zA-Z]+)>/g, 
    after: (match, color) => {
      const colorCode = isNaN(color as any) ? colorMap[color.toLowerCase()] || 15 : parseInt(color);
      return `<span style='color: var(--color-${colorCode})'>`;
    }, 
    strip: "" 
  }
);

parser.add(
  "add",
  async (args) => args.reduce((a: string, b: string) => +a + +b, 0),
);
parser.add(
  "sub",
  async (args) => args.reduce((a: string, b: string) => +a - +b, 0),
);
parser.add("rand", async (args) => {
  const min = +args[0];
  const max = +args[1];
  return Math.floor(Math.random() * (max - min + 1) + min);
});

parser.add("u", async (args, data) => {
  let dbref;
  let funName;
  const [fun, ...funArgs] = args;
  if (fun.includes("/")) {
    [dbref = "me", funName] = fun.split("/");
  }

  console.log(data);

  return "foooo";
});

export default parser;

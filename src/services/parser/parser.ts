import { Parser } from "../../../deps.ts";
const parser = new Parser();

parser.addSubs(
  "telnet",
  { before: /%r/g, after: "\n" },
  { before: /%b/g, after: " ", strip: " " },
  { before: /%t/g, after: "\t" },
  { before: /%\[/g, after: "[" },
  { before: /%\]/g, after: "]" },
  { before: /%\(/g, after: "(" },
  { before: /%\)/g, after: ")" },

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
  { before: /%[cx]X/g, after: "\x1b[40m", strip: "" },
  { before: /%[cx]R/g, after: "\x1b[41m", strip: "" },
  { before: /%[cx]G/g, after: "\x1b[42m", strip: "" },
  { before: /%[cx]Y/g, after: "\x1b[43m", strip: "" },
  { before: /%[cx]B/g, after: "\x1b[44m", strip: "" },
  { before: /%[cx]M/g, after: "\x1b[45m", strip: "" },
  { before: /%[cx]C/g, after: "\x1b[46m", strip: "" },
  { before: /%[cx]W/g, after: "\x1b[47m", strip: "" },
  { before: /%[cx]h/g, after: "\x1b[1m", strip: "" },
  { before: /%[cx]u/g, after: "\x1b[4m", strip: "" },
  // @ts-ignore: mu-parser supports functions
  { before: /%[X|C]<#([0-9a-fA-F]{6})>/g, 
    // @ts-ignore: mu-parser supports functions
    after: ((_match: string, hex: string) => {
         const r = parseInt(hex.substring(0, 2), 16);
         const g = parseInt(hex.substring(2, 4), 16);
         const b = parseInt(hex.substring(4, 6), 16);
         return `\x1b[48;2;${r};${g};${b}m`;
    // deno-lint-ignore no-explicit-any
    }) as any, 
    strip: "" 
  },
  // @ts-ignore: mu-parser supports functions
  { before: /<#([0-9a-fA-F]{6})>|%[xc]<#([0-9a-fA-F]{6})>/g, 
    // @ts-ignore: mu-parser supports functions
    after: ((_match: string, hex: string, hex2?: string) => {
         const h = hex || hex2 || "000000";
         const r = parseInt(h.substring(0, 2), 16);
         const g = parseInt(h.substring(2, 4), 16);
         const b = parseInt(h.substring(4, 6), 16);
         return `\x1b[38;2;${r};${g};${b}m`;
    // deno-lint-ignore no-explicit-any
    }) as any, 
    strip: "" 
  }
);

parser.addSubs(
  "html",
  { before: /%r/g, after: "<br />" },
  { before: /%b/g, after: "&nbsp;", strip: " " },
  { before: /%t/g, after: "&nbsp;&nbsp;&nbsp;&nbsp;" },
  { before: /%\[/g, after: "[" },
  { before: /%\]/g, after: "]" },
  { before: /%\(/g, after: "(" },
  { before: /%\)/g, after: ")" },

  //color
  {
    before: /%[cx]n/g,
    after: "<span style='color: inherit; background-color: inherit'></b></i>",
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
  { before: /%[cx]X/g, after: "<span style='background-color: black'>", strip: "" },
  { before: /%[cx]R/g, after: "<span style='background-color: red'>", strip: "" },
  { before: /%[cx]G/g, after: "<span style='background-color: green'>", strip: "" },
  { before: /%[cx]Y/g, after: "<span style='background-color: yellow'>", strip: "" },
  { before: /%[cx]B/g, after: "<span style='background-color: blue'>", strip: "" },
  { before: /%[cx]M/g, after: "<span style='background-color: magenta'>", strip: "" },
  { before: /%[cx]C/g, after: "<span style='background-color: cyan'>", strip: "" },
  { before: /%[cx]W/g, after: "<span style='background-color: white'>", strip: "" },
  { before: /%[cx]h/g, after: "<b>", strip: "" },
  {
    before: /%[cx]u/g,
    after: "<span style='border-bottom: 1px solid'>",
    strip: "",
  },
  { before: /%[cx]i/g, after: "<i>", strip: "" },
  { before: /%[cx]#(\d+)/g, after: "\x1b[38;5;$1m", strip: "" },
  { before: /%[X|C]<#([0-9a-fA-F]{6})>/g, after: "<span style='background-color: #$1'>", strip: "" },
  { before: /<#([0-9a-fA-F]{6})>|%[xc]<#([0-9a-fA-F]{6})>/g, after: "<span style='color: #$1$2'>", strip: "" }
);

export const updateParserSubs = (subs: Record<string, string>) => {
    // Add custom substitutions to both telnet and html lists
    Object.entries(subs).forEach(([key, value]) => {
        // Simple string replacement
        const pattern = new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
        
        parser.addSubs("telnet", {
            before: pattern,
            after: value
        });
        
         parser.addSubs("html", {
            before: pattern,
            after: value
        });
    });
};

export default parser;

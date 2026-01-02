import { registerFunction } from "./registry.ts";
import { center, ljust, rjust, repeatString } from "../../../utils/format.ts";

registerFunction("cat", (args) => {
  return args.join("");
});

registerFunction("strlen", (args) => {
  return (args[0] || "").length.toString();
});

registerFunction("ucase", (args) => {
    return (args[0] || "").toUpperCase();
});

registerFunction("lcase", (args) => {
    return (args[0] || "").toLowerCase();
});

registerFunction("center", (args) => {
    return center(args[0], parseInt(args[1] || "78"), args[2] || " ");
});

registerFunction("ljust", (args) => {
    return ljust(args[0], parseInt(args[1] || "78"), args[2] || " ");
});

registerFunction("rjust", (args) => {
    return rjust(args[0], parseInt(args[1] || "78"), args[2] || " ");
});

registerFunction("repeat", (args) => {
    return repeatString(args[0], parseInt(args[1] || "1"));
});

// New functions
registerFunction("mid", (args) => {
    const str = args[0] || "";
    const start = parseInt(args[1] || "0");
    const len = parseInt(args[2] || str.length.toString());
    return str.substring(start, start + len);
});

registerFunction("left", (args) => {
    const str = args[0] || "";
    const len = parseInt(args[1] || "0");
    return str.substring(0, len);
});

registerFunction("right", (args) => {
    const str = args[0] || "";
    const len = parseInt(args[1] || "0");
    if (len >= str.length) return str;
    return str.substring(str.length - len);
});

registerFunction("capstr", (args) => {
    const str = args[0] || "";
    if (!str) return "";
    return str.charAt(0).toUpperCase() + str.slice(1);
});

registerFunction("scramble", (args) => {
    const str = args[0] || "";
    const arr = str.split("");
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr.join("");
});

registerFunction("space", (args) => {
    const len = parseInt(args[0] || "1");
    if (len < 0) return "";
    return " ".repeat(len);
});

registerFunction("ansi", (args) => {
    const codes = args[0];
    const text = args[1];
    let output = "";
    
    // Handle Hex/HTML codes <#RRGGBB>
    const hexMatch = codes.match(/^<#([0-9a-fA-F]{6})>$/);
    if (hexMatch) {
        const hex = hexMatch[1];
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        output += `\x1b[38;2;${r};${g};${b}m`;
    } else {
        // Iterate through characters
        for (const char of codes) {
            switch(char) {
                case 'n': output += "\x1b[0m"; break;
                case 'x': output += "\x1b[30m"; break;
                case 'r': output += "\x1b[31m"; break;
                case 'g': output += "\x1b[32m"; break;
                case 'y': output += "\x1b[33m"; break;
                case 'b': output += "\x1b[34m"; break;
                case 'm': output += "\x1b[35m"; break;
                case 'c': output += "\x1b[36m"; break;
                case 'w': output += "\x1b[37m"; break;
                case 'X': output += "\x1b[40m"; break;
                case 'R': output += "\x1b[41m"; break;
                case 'G': output += "\x1b[42m"; break;
                case 'Y': output += "\x1b[43m"; break;
                case 'B': output += "\x1b[44m"; break;
                case 'M': output += "\x1b[45m"; break;
                case 'C': output += "\x1b[46m"; break;
                case 'W': output += "\x1b[47m"; break;
                case 'h': output += "\x1b[1m"; break;
                case 'u': output += "\x1b[4m"; break;
                case 'i': output += "\x1b[7m"; break;
            }
        }
    }
    
    return output + text + "\x1b[0m";
});

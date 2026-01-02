

interface SafeMessageProps {
  message: string;
}

import { Fragment } from "preact";

interface SafeMessageProps {
  message: string;
}

// Hex Color Map (Xterm-ish)
const hexColors: Record<string, string> = {
  // MUX codes
  r: "#ef4444", // Red
  g: "#22c55e", // Green
  y: "#eab308", // Yellow
  b: "#3b82f6", // Blue
  m: "#d946ef", // Magenta
  c: "#06b6d4", // Cyan
  w: "#f3f4f6", // White
  x: "#9ca3af", // Gray (Black/Bright Black)
  
  // ANSI maps (0-7 standard, 8-15 bright)
  "30": "#4b5563", // Black
  "31": "#ef4444", // Red
  "32": "#22c55e", // Green
  "33": "#eab308", // Yellow
  "34": "#3b82f6", // Blue
  "35": "#d946ef", // Magenta
  "36": "#06b6d4", // Cyan
  "37": "#f3f4f6", // White
  
  // Brights
  "90": "#6b7280", // Bright Black
  "91": "#f87171", // Bright Red
  "92": "#4ade80", // Bright Green
  "93": "#facc15", // Bright Yellow
  "94": "#60a5fa", // Bright Blue
  "95": "#e879f9", // Bright Magenta
  "96": "#22d3ee", // Bright Cyan
  "97": "#ffffff", // Bright White
};

export default function SafeMessage({ message }: SafeMessageProps) {
  if (!message) return null;

  // Split by ANSI codes OR MUX codes
  // ANSI: \u001b[...m
  // MUX: %c[x]
  // deno-lint-ignore no-control-regex
  const parts = message.split(/(\u001b\[(?:\d+(?:;\d+)*)?m|%[cx]?[rbgymcwxhui]|%[cx]n|%[cx]#\d+)/g);

  let isBold = false;
  let isUnderline = false;
  let isItalic = false;
  let color = ""; // Hex string

  return (
    <Fragment>
      {parts.map((part, i) => {
        if (!part) return null;

        // ANSI Handling
        if (part.startsWith("\x1b[")) {
           // Remove \x1b[ and m
           const codeStr = part.slice(2, -1);
           const codes = codeStr.split(";");
           
           for (const c of codes) {
               if (c === "0" || c === "") {
                   // Reset
                   isBold = false; isUnderline = false; isItalic = false; color = "";
               } else if (c === "1") {
                   isBold = true;
               } else if (c === "3") {
                   isItalic = true;
               } else if (c === "4") {
                   isUnderline = true;
               } else if (hexColors[c]) {
                   color = hexColors[c];
               }
           }
           return null;
        }

        // MUX Handling
        if (part.startsWith("%")) {
          const code = part.slice(1).toLowerCase();
          
          if (code === "r") return <br key={i} />;
          if (code === "b") return <Fragment key={i}>&nbsp;</Fragment>;
          if (code === "t") return <Fragment key={i}>&nbsp;&nbsp;&nbsp;&nbsp;</Fragment>;
          
          // Reset
          if (code === "cn" || code === "xn") {
            isBold = false; isUnderline = false; isItalic = false; color = "";
            return null;
          }

          // Format
          if (code === "ch" || code === "xh") { isBold = true; return null; }
          if (code === "cu" || code === "xu") { isUnderline = true; return null; }
          if (code === "ci" || code === "xi") { isItalic = true; return null; }

          // Colors (cr, cg, etc or just r, g if %r style used improperly?)
          // MUX usually is %cr, %cg. 
          // code is "cr" -> colorCode "r"
          // code is "x34" -> Xterm? (Not handled yet, default to ignore)
          
          let colorCode = "";
          if (code.startsWith("c") || code.startsWith("x")) {
             colorCode = code[1];
          }
          
          if (hexColors[colorCode]) {
              color = hexColors[colorCode];
              return null;
          }
          
          return null;
        }

        // Text
        const style: Record<string, string> = {};
        if (color) style.color = color;
        if (isBold) style.fontWeight = "bold";
        if (isUnderline) style.textDecoration = "underline";
        if (isItalic) style.fontStyle = "italic";

        return (
          <span key={i} style={style}>
            {part}
          </span>
        );
      })}
    </Fragment>
  );
}

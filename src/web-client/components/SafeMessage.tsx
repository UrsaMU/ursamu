import { Fragment } from "preact";

interface SafeMessageProps {
  message: string;
}

const colorMap: Record<string, string> = {
  r: "text-red-500",
  g: "text-green-500",
  y: "text-yellow-500",
  b: "text-blue-500",
  m: "text-magenta-500",
  c: "text-cyan-500",
  w: "text-white",
  x: "text-gray-500",
};

export default function SafeMessage({ message }: SafeMessageProps) {
  if (!message) return null;

  // Split the message by tokens like %r, %b, %t, %cn, %cr, etc.
  // We use a regex that captures the tokens.
  const parts = message.split(/(%[crbgymcwxnhui]|%[cx][rbgymcwxhui]|%[cx]n|%[cx]#\d+)/g);

  let isBold = false;
  let isUnderline = false;
  let isItalic = false;
  let currentColor = "";

  return (
    <Fragment>
      {parts.map((part, i) => {
        if (!part) return null;

        if (part.startsWith("%")) {
          const code = part.slice(1).toLowerCase();
          
          if (code === "r") return <br key={i} />;
          if (code === "b") return <Fragment key={i}>&nbsp;</Fragment>;
          if (code === "t") return <Fragment key={i}>&nbsp;&nbsp;&nbsp;&nbsp;</Fragment>;
          
          // Reset
          if (code === "cn" || code === "xn") {
            isBold = false;
            isUnderline = false;
            isItalic = false;
            currentColor = "";
            return null;
          }

          // Formatting
          if (code === "ch" || code === "xh") {
            isBold = true;
            return null;
          }
          if (code === "cu" || code === "xu") {
            isUnderline = true;
            return null;
          }
          if (code === "ci" || code === "xi") {
            isItalic = true;
            return null;
          }

          // Colors
          const colorCode = code.length === 2 ? code[1] : (code.length === 1 ? code[0] : "");
          if (colorMap[colorCode]) {
            currentColor = colorMap[colorCode];
            return null;
          }

          // Ignore unknown or complex codes for now
          return null;
        }

        // It's text
        const classes = [
          isBold ? "font-bold" : "",
          isUnderline ? "underline" : "",
          isItalic ? "italic" : "",
          currentColor,
        ].filter(Boolean).join(" ");

        return (
          <span key={i} class={classes}>
            {part}
          </span>
        );
      })}
    </Fragment>
  );
}

import { JSX } from "preact";

export function ParsedText({ text }: { text?: string }): JSX.Element {
  if (!text) return <span />;

  const tokens = text.split(/(%[a-z]{2})/g);
  let currentClasses = ["text-slate-300"]; // Default text color

  const elements: JSX.Element[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];

    if (token.match(/^%[a-z]{2}$/)) {
      // It's a tag
      switch (token) {
        case "%ch":
          currentClasses.push("font-bold");
          break;
        case "%cn":
          currentClasses = ["text-slate-300"];
          break;
        // Colors
        // Reset
        case "%cr":
          currentClasses = currentClasses.filter((c) => !c.startsWith("text-"));
          currentClasses.push("text-red-400");
          break;
        case "%cg":
          currentClasses = currentClasses.filter((c) => !c.startsWith("text-"));
          currentClasses.push("text-green-400");
          break;
        case "%cy":
          currentClasses = currentClasses.filter((c) => !c.startsWith("text-"));
          currentClasses.push("text-yellow-400");
          break;
        case "%cb":
          currentClasses = currentClasses.filter((c) => !c.startsWith("text-"));
          currentClasses.push("text-blue-400");
          break;
        case "%cm":
          currentClasses = currentClasses.filter((c) => !c.startsWith("text-"));
          currentClasses.push("text-pink-400");
          break;
        case "%cc":
          currentClasses = currentClasses.filter((c) => !c.startsWith("text-"));
          currentClasses.push("text-cyan-400");
          break;
        case "%cw":
          currentClasses = currentClasses.filter((c) => !c.startsWith("text-"));
          currentClasses.push("text-white");
          break;
        case "%cx":
          currentClasses = currentClasses.filter((c) => !c.startsWith("text-"));
          currentClasses.push("text-slate-900");
          break;
        // Spacing
        case "%r":
          elements.push(<br />);
          break;
        case "%t":
          elements.push(<span class="inline-block w-8"></span>);
          break;
        case "%b":
          currentClasses.push("text-blue-500");
          break; // Explicit blue often used for headers
      }
    } else {
      // It's text
      if (token) {
        elements.push(<span class={currentClasses.join(" ")}>{token}</span>);
      }
    }
  }

  return <>{elements}</>;
}

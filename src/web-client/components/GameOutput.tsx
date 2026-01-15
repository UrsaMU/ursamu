import { JSX } from "preact";
import { ParsedText } from "./ParsedText.tsx";

interface GameOutputProps {
  messages: Array<{ msg?: string; data?: any }>;
}

export default function GameOutput({ messages }: GameOutputProps) {
  return (
    <div
      class="flex-1 overflow-y-auto p-6 space-y-1 font-mono text-sm md:text-base leading-relaxed scroll-smooth text-slate-200"
      id="game-output"
    >
      {messages.length === 0 && (
        <div class="text-slate-500 italic text-center mt-10">
          Connecting to server...
        </div>
      )}
      {messages.map((m, idx) => (
        <div key={idx} class="break-words whitespace-pre-wrap">
          <ParsedText text={m.msg} />
        </div>
      ))}
    </div>
  );
}

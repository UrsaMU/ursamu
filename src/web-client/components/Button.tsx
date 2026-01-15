import type { JSX } from "preact";
import { IS_BROWSER } from "$fresh/runtime.ts";

export function Button(props: JSX.HTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      disabled={!IS_BROWSER || props.disabled}
      class="px-4 py-2 border border-white/10 rounded bg-slate-800/80 hover:bg-primary/80 hover:border-primary/50 text-slate-200 transition-all backdrop-blur-sm"
    />
  );
}

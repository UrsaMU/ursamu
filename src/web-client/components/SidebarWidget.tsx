import { ComponentChildren } from "preact";

export default function SidebarWidget(
  { title, children }: { title: string; children: ComponentChildren },
) {
  return (
    <div class="mb-6">
      <h3 class="flex items-center gap-2 mb-4 pb-2 border-b border-white/5 text-xs font-bold uppercase tracking-widest text-muted">
        {title}
      </h3>
      <div class="">{children}</div>
    </div>
  );
}

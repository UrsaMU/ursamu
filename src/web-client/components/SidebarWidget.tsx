import { ComponentChildren } from "preact";

export default function SidebarWidget(
  { title, children, icon }: { title: string; children: ComponentChildren; icon?: ComponentChildren },
) {
  return (
    <div class="bg-gradient-to-br from-slate-900/90 to-slate-900/50 border border-white/10 rounded-2xl p-6 relative overflow-hidden shadow-xl shadow-black/20 backdrop-blur-xl group">
      {/* Glossy Top Highlight */}
      <div class="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent opacity-50"></div>
      
      {/* Subtle Inner Glow */}
      <div class="absolute -top-24 -right-24 w-48 h-48 bg-white/5 rounded-full blur-3xl pointer-events-none group-hover:bg-white/10 transition-colors duration-500"></div>

      {/* Header */}
      <div class="flex items-center justify-between mb-4 pb-4 border-b border-white/10 relative z-10">
        <h3 class="text-sm font-header font-bold uppercase tracking-widest text-shadow-sm flex items-center gap-2">
            <span class="text-slate-100">
                {title}
            </span>
        </h3>
        {icon && (
            <div class="text-slate-300">
                {icon}
            </div>
        )}
      </div>
      
      {/* Content */}
      <div class="relative z-10">{children}</div>
    </div>
  );
}

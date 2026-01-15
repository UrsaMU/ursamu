import { ComponentChildren } from "preact";
import SidebarWidget from "./SidebarWidget.tsx";
import StickyNav from "../islands/StickyNav.tsx";

interface LayoutProps {
  children: ComponentChildren;
  title?: string;
  isLanding?: boolean;
  currentPath?: string;
  noSidebar?: boolean;
  noHero?: boolean;
}

export default function Layout({
  children,
  isLanding: _isLanding = false,
  currentPath = "",
  noSidebar = false,
  noHero: _noHero = false,
}: LayoutProps) {
  return (
    <div class="min-h-screen bg-background text-text font-sans selection:bg-primary/30 selection:text-white relative flex flex-col">
      {/* Background Elements */}
      <div class="fixed inset-0 z-0 pointer-events-none bg-[#050505] bg-site-bg bg-cover bg-center bg-fixed bg-no-repeat">
         {/* Obsidian Overlay - Darkens the image to ensure readability while keeping the vibe */}
         <div class="absolute inset-0 bg-[#050505]/80 backdrop-blur-[2px]"></div>

         {/* Subtle Grain Texture */}
         <div class="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")` }}></div>
         
         {/* Deep Glows - Adjusted to sit above the image but below content */}
         <div class="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-primary/5 rounded-full blur-[120px] animate-pulse-slow"></div>
         <div class="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-blue-900/10 rounded-full blur-[120px] animate-pulse-slow" style={{ animationDelay: "2s" }}></div>
         
         {/* Vignette */}
         <div class="absolute inset-0 bg-[radial-gradient(circle_at_center,_transparent_40%,_black_100%)] opacity-90"></div>
      </div>

      <StickyNav currentPath={currentPath} />

      {/* Main Content Grid */}
      {!noSidebar
        ? (
          <div
            id="main-content"
            class="container mx-auto px-4 mt-8 grid grid-cols-1 lg:grid-cols-[1fr_20rem] gap-8 relative z-10 pb-12"
          >
            <main class="min-h-[60vh]">
              {children}
            </main>

            {/* Right Sidebar - Widgets */}
            <aside class="space-y-6 hidden lg:block">
              <SidebarWidget
                title="Game Status"
                icon={
                    <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path></svg>
                }
              >
                <div class="space-y-4">
                  <div class="flex justify-between items-center text-sm border-b border-glass-border pb-2">
                    <span class="text-slate-300 uppercase tracking-wider text-xs font-header font-bold">
                      Players Online
                    </span>
                    <span class="text-white font-mono font-bold text-lg drop-shadow-[0_0_8px_rgba(245,158,11,0.3)]">
                      12
                    </span>
                  </div>
                  <div class="flex justify-between items-center text-sm">
                    <span class="text-slate-300 uppercase tracking-wider text-xs font-header font-bold">
                      Server Date
                    </span>
                    <span class="text-slate-300 font-mono text-xs">2239-03-10</span>
                  </div>
                  <div class="pt-2 text-xs text-center flex items-center justify-center gap-2 text-emerald-400 font-mono uppercase tracking-wider bg-emerald-950/20 py-2 rounded border border-emerald-500/10">
                    <span class="relative flex h-2 w-2">
                      <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75">
                      </span>
                      <span class="relative inline-flex rounded-full h-2 w-2 bg-emerald-500">
                      </span>
                    </span>
                    Operational
                  </div>
                </div>
              </SidebarWidget>

              <SidebarWidget
                title="Upcoming Events"
                icon={
                    <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                }
              >
                <ul class="space-y-3">
                  <li class="flex gap-3 items-start group cursor-pointer p-2 rounded hover:bg-glass-highlight transition-colors border border-transparent hover:border-glass-border">
                    <div class="bg-surface border border-glass-border rounded px-2 py-1 text-center min-w-[3rem] group-hover:border-primary/50 transition-colors shadow-lg">
                      <div class="text-[0.6rem] uppercase text-red-400 font-bold font-header">
                        MAR
                      </div>
                      <div class="text-lg font-bold text-white leading-none font-mono">
                        15
                      </div>
                    </div>
                    <div>
                      <div class="text-sm font-bold text-white group-hover:text-primary transition-colors font-header tracking-wide">
                        Officer's Ball
                      </div>
                      <div class="text-xs text-slate-300 mt-0.5 font-mono">
                        20:00 server time
                      </div>
                    </div>
                  </li>
                  <li class="flex gap-3 items-start group cursor-pointer p-2 rounded hover:bg-glass-highlight transition-colors border border-transparent hover:border-glass-border">
                    <div class="bg-surface border border-glass-border rounded px-2 py-1 text-center min-w-[3rem] group-hover:border-primary/50 transition-colors shadow-lg">
                      <div class="text-[0.6rem] uppercase text-sky-400 font-bold font-header">
                        MAR
                      </div>
                      <div class="text-lg font-bold text-white leading-none font-mono">
                        18
                      </div>
                    </div>
                    <div>
                      <div class="text-sm font-bold text-white group-hover:text-primary transition-colors font-header tracking-wide">
                        Fleet Maneuvers
                      </div>
                      <div class="text-xs text-slate-300 mt-0.5 font-mono">
                        14:00 server time
                      </div>
                    </div>
                  </li>
                </ul>
              </SidebarWidget>

              <SidebarWidget
                title="Recent Scenes"
                icon={
                    <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>
                }
              >
                <ul class="space-y-1 text-sm">
                  <li>
                    <a href="#" class="group block p-2 rounded hover:bg-glass-highlight transition-colors border border-transparent hover:border-glass-border">
                      <div class="flex justify-between items-start mb-1">
                        <span class="text-[0.6rem] font-bold px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono uppercase">
                          Social
                        </span>
                        <span class="text-xs text-slate-300 font-mono group-hover:text-slate-200">
                          2239-03-10
                        </span>
                      </div>
                      <span class="text-white group-hover:text-primary transition-colors font-bold block text-sm font-header tracking-wide">
                        Distractions
                      </span>
                      <span class="text-slate-300 text-xs mt-1 block group-hover:text-slate-200">
                         The Mess Hall
                      </span>
                    </a>
                  </li>
                  <li>
                    <a href="#" class="group block p-2 rounded hover:bg-glass-highlight transition-colors border border-transparent hover:border-glass-border">
                      <div class="flex justify-between items-start mb-1">
                        <span class="text-[0.6rem] font-bold px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 font-mono uppercase">
                          Event
                        </span>
                        <span class="text-xs text-slate-300 font-mono group-hover:text-slate-200">
                          2239-03-09
                        </span>
                      </div>
                      <span class="text-white group-hover:text-primary transition-colors font-bold block text-sm font-header tracking-wide">
                        The End of the Line
                      </span>
                      <span class="text-slate-300 text-xs mt-1 block group-hover:text-slate-200">
                        Briefing Room
                      </span>
                    </a>
                  </li>
                </ul>
              </SidebarWidget>
            </aside>
          </div>
        )
        : (
          /* Landing Page or No Sidebar Content (Full Width) */
          <main
            class={`flex-grow w-full relative z-10 ${
              noSidebar ? "flex flex-col items-center mt-8" : ""
            }`}
          >
            {children}
          </main>
        )}

      {/* Minimal Footer */}
      <footer class="mt-auto border-t border-white/5 bg-black/40 backdrop-blur-md relative z-10">
        <div class="container mx-auto px-4 py-8">
          <div class="flex flex-col md:flex-row justify-between items-center gap-4 text-xs text-slate-400 font-mono">
            <p>&copy; 2024 UrsaMU Engine.</p>
            <div class="flex gap-6">
              <a href="#" class="hover:text-primary transition-colors">Privacy</a>
              <a href="#" class="hover:text-primary transition-colors">Terms</a>
              <a
                href="https://github.com/lcanady/ursamu"
                class="hover:text-primary transition-colors"
              >
                GitHub
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

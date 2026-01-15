import { useEffect, useState } from "preact/hooks";

interface StickyNavProps {
  currentPath: string;
  forceShowLogo?: boolean;
}

export default function StickyNav(
  { currentPath, forceShowLogo = false }: StickyNavProps,
) {

  const [config, setConfig] = useState<
    {
      game?: { name: string };
      server?: { http: number; telnet: number; ws: number };
    } | null
  >(null);
  const [username, setUsername] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {


    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (
        menuOpen && !target.closest("#user-menu-button") &&
        !target.closest("#user-menu-dropdown")
      ) {
        setMenuOpen(false);
      }
    };

    const fetchConfig = async () => {
      try {
        const res = await fetch("http://localhost:4203/api/v1/config");
        const data = await res.json();
        setConfig(data);
      } catch (e) {
        console.error("Failed to fetch config", e);
      }
    };

    if (typeof localStorage !== "undefined") {
      const token = localStorage.getItem("ursamu_token");
      const storedName = localStorage.getItem("ursamu_username");
      if (token && storedName) {
        setUsername(storedName);
      }
    }


    globalThis.addEventListener("click", handleClickOutside);
    fetchConfig();

    return () => {

      globalThis.removeEventListener("click", handleClickOutside);
    };
  }, [menuOpen]);

  const handleLogout = () => {
    localStorage.removeItem("ursamu_token");
    localStorage.removeItem("ursamu_username");
    globalThis.location.href = "/";
  };

  return (
    <nav
      class="sticky top-0 w-full z-50 border-t border-white/5 border-b border-[#F59E0B]/10 shadow-lg transition-all duration-500 ease-in-out bg-[#050505]/95 backdrop-blur-xl py-2 shadow-[#F59E0B]/5"
    >
      <div class="container mx-auto px-4 flex items-center justify-between transition-all duration-500">
        {/* Left Side: Info & Nav */}
        <div class="flex items-center gap-6">
          <div class="flex items-center gap-3 transition-all duration-500 ease-out overflow-hidden opacity-100 max-w-[400px] translate-x-0">
            {config && (
              <a
                href="/"
                class="flex items-center gap-2 animate-fade-in transition-colors group"
              >
                <span class="text-2xl md:text-3xl font-header font-black text-[#F59E0B] tracking-tighter uppercase drop-shadow-md group-hover:text-amber-400 transition-colors duration-300">
                  {config.game?.name || "UrsaMU"}
                </span>
              </a>
            )}

            {/* Separator */}
            <div class="h-6 w-px bg-white/10"></div>
          </div>

          {/* Navigation Links */}
          <div class="flex items-center gap-1 overflow-x-auto no-scrollbar">
            <NavLink href="/play" active={currentPath === "/play"}>
              Play
            </NavLink>
            <NavLink href="/wiki" active={currentPath.startsWith("/wiki")}>
              Wiki
            </NavLink>
            <NavLink href="/scenes" active={currentPath.startsWith("/scenes")}>
              Scenes
            </NavLink>
            <NavLink
              href="/directory"
              active={currentPath.startsWith("/directory")}
            >
              Directory
            </NavLink>
          </div>
        </div>

        {/* Right side: Auth or Profile */}
        <div class="flex items-center gap-4 relative">
          {username
            ? (
              <div class="relative">
                <button
                  type="button"
                  id="user-menu-button"
                  onClick={() => setMenuOpen(!menuOpen)}
                  class="flex items-center gap-3 animate-fade-in hover:bg-white/5 rounded-full pl-3 pr-1 py-1 transition-colors border border-transparent hover:border-white/5"
                >
                  <span class="text-xs font-bold uppercase tracking-wider text-muted select-none">
                    {username}
                  </span>
                  <div class="w-8 h-8 rounded-full bg-gradient-to-br from-[#F59E0B] to-amber-600 flex items-center justify-center text-white font-bold text-xs shadow-lg border border-white/10">
                    {username.charAt(0).toUpperCase()}
                  </div>
                </button>

                {/* Dropdown Menu */}
                {menuOpen && (
                  <div
                    id="user-menu-dropdown"
                    class="absolute right-0 top-full mt-2 w-48 bg-[#0A0A0A] border border-white/10 rounded-xl shadow-2xl overflow-hidden animate-fade-in backdrop-blur-xl ring-1 ring-white/5"
                  >
                    <div class="py-1">
                      <a
                        href="/profile"
                        class="block px-4 py-3 text-sm text-slate-300 hover:bg-white/5 hover:text-white transition-colors border-b border-white/5"
                      >
                        Profile
                      </a>
                      <button
                        type="button"
                        onClick={handleLogout}
                        class="w-full text-left px-4 py-3 text-sm text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors"
                      >
                        Logout
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
            : (
              <>
                <a
                  href={`/login?redirect=${encodeURIComponent(currentPath)}`}
                  class="text-xs font-bold uppercase tracking-wider text-slate-400 hover:text-white transition-colors"
                >
                  Login
                </a>
                <span class="text-white/10">|</span>
                <a
                  href={`/register?redirect=${encodeURIComponent(currentPath)}`}
                  class="text-xs font-bold uppercase tracking-wider text-[#F59E0B] hover:text-amber-400 transition-colors"
                >
                  Register
                </a>
              </>
            )}
        </div>
      </div>
    </nav>
  );
}

function NavLink(
  { href, children, active = false }: {
    href: string;
    children: string;
    active?: boolean;
  },
) {
  return (
    <a
      href={href}
      class={`px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-md transition-all duration-300 border border-transparent ${
        active
          ? "text-[#F59E0B]"
          : "text-slate-400 hover:text-white hover:bg-white/5"
      }`}
    >
      {children}
    </a>
  );
}

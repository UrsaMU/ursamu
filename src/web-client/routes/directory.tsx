import { Head } from "$fresh/runtime.ts";
import { Handlers, PageProps } from "$fresh/server.ts";
import Layout from "../components/Layout.tsx";

interface Character {
  _id: string;
  name: string;
  alias?: string;
  avatar?: string;
  title?: string;
  location?: string;
  flags?: string[];
  dbref?: string;
}

interface DirectoryData {
  characters: Character[];
  isConnected: boolean;
}

export const handler: Handlers<DirectoryData> = {
  async GET(_, ctx) {
    try {
      // Attempt to fetch characters from API
      // If endpoint doesn't exist, we'll handle gracefully
      const res = await fetch("http://localhost:4203/api/v1/characters");

      let characters: Character[] = [];
      if (res.ok) {
        characters = await res.json();
      } else {
        // Mock data for display if API fails
        // In production this might return empty or error
        console.warn("API fetch failed, checking status...");
      }

      return ctx.render({
        characters,
        isConnected: res.ok,
      });
    } catch (e) {
      console.error("Directory fetch error:", e);
      return ctx.render({ characters: [], isConnected: false });
    }
  },
};

export default function Directory({ data, url }: PageProps<DirectoryData>) {
  const { characters, isConnected } = data;

  return (
    <Layout currentPath={url.pathname}>
      <Head>
        <title>UrsaMU - Directory</title>
      </Head>

      <div class="max-w-7xl mx-auto">
        <div class="flex flex-col md:flex-row justify-between items-end mb-10 gap-4">
          <div>
            <h1 class="text-4xl font-header font-bold text-transparent bg-clip-text bg-gradient-to-r from-white to-slate-400 uppercase tracking-tight mb-2">
              Character Directory
            </h1>
            <p class="text-slate-400 text-sm">
              Discover the diverse cast of characters inhabiting this world.
            </p>
          </div>

          <div class="bg-slate-900/50 border border-white/5 rounded-full px-4 py-2 flex items-center gap-2">
            <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse">
            </span>
            <span class="text-xs font-bold uppercase tracking-wider text-slate-300">
              {characters.length} Registered
            </span>
          </div>
        </div>

        {characters.length === 0
          ? (
            <div class="flex flex-col items-center justify-center py-20 bg-slate-900/40 border border-white/5 rounded-3xl backdrop-blur-sm animate-fade-in">
              <div class="text-6xl mb-6 opacity-20">📂</div>
              <h2 class="text-xl font-bold text-white mb-2">
                Directory Unavailable
              </h2>
              <p class="text-slate-400 max-w-md text-center">
                {isConnected
                  ? "No characters found in the directory."
                  : "Unable to connect to the character database. Please try again later."}
              </p>
            </div>
          )
          : (
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {characters.map((char) => (
                <div
                  key={char._id || char.dbref}
                  class="bg-slate-900/60 border border-white/5 rounded-2xl p-6 group hover:bg-slate-900/80 hover:border-white/10 transition-all duration-300 relative overflow-hidden backdrop-blur-md hover:-translate-y-1 hover:shadow-xl hover:shadow-primary/5"
                >
                  <div class="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                  </div>

                  <div class="flex items-start gap-4 relative z-10">
                    <div class="shrink-0">
                      {char.avatar
                        ? (
                          <img
                            src={char.avatar}
                            alt={char.name}
                            class="w-16 h-16 rounded-xl object-cover shadow-lg border border-white/10 group-hover:scale-105 transition-transform"
                          />
                        )
                        : (
                          <div class="w-16 h-16 rounded-xl bg-gradient-to-br from-slate-800 to-slate-900 border border-white/10 flex items-center justify-center text-xl font-bold text-slate-500 shadow-lg group-hover:text-primary transition-colors">
                            {char.name.substring(0, 2).toUpperCase()}
                          </div>
                        )}
                    </div>

                    <div class="flex-grow min-w-0">
                      <h3 class="text-lg font-bold text-white group-hover:text-primary transition-colors truncate">
                        {char.name}
                      </h3>
                      {char.alias && (
                        <p class="text-xs text-slate-500 font-mono mb-1">
                          ({char.alias})
                        </p>
                      )}
                      {char.title && (
                        <p class="text-sm text-slate-400 line-clamp-2 leading-relaxed">
                          {char.title}
                        </p>
                      )}
                    </div>
                  </div>

                  <div class="mt-6 pt-4 border-t border-white/5 flex justify-between items-center text-xs">
                    <span class="text-slate-500 font-bold uppercase tracking-wider">
                      {char.location || "Unknown Location"}
                    </span>
                    {(char.flags || []).includes("connected") && (
                      <span class="flex items-center gap-1.5 text-emerald-400 font-bold uppercase tracking-wider text-[0.6rem] bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                        <span class="w-1.5 h-1.5 rounded-full bg-emerald-500">
                        </span>{" "}
                        Online
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
      </div>
    </Layout>
  );
}

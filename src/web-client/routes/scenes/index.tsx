import { Head } from "$fresh/runtime.ts";
import { Handlers, PageProps } from "$fresh/server.ts";
import Layout from "../../components/Layout.tsx";
import { IScene } from "../../../@types/IScene.ts";

interface DateProps {
  scenes: IScene[];
}

export const handler: Handlers<DateProps> = {
  async GET(_, ctx) {
    try {
      // Fetch scenes from the API
      // Using localhost:4203 as per default config
      const res = await fetch("http://localhost:4203/api/v1/scenes");
      if (!res.ok) {
        return ctx.render({ scenes: [] });
      }
      const scenes = await res.json();
      return ctx.render({ scenes });
    } catch (e) {
      console.error("Error fetching scenes:", e);
      return ctx.render({ scenes: [] });
    }
  },
};

export default function Scenes({ data, url }: PageProps<DateProps>) {
  const { scenes } = data;

  return (
    <Layout currentPath={url.pathname}>
      <Head>
        <title>UrsaMU - Active Scenes</title>
      </Head>

      <div class="space-y-6">
        <div class="flex justify-between items-center pb-6">
          <div>
            <h1 class="text-4xl font-header font-bold text-transparent bg-clip-text bg-gradient-to-r from-white to-slate-400 uppercase tracking-tight">
              Active Scenes
            </h1>
            <p class="text-slate-400 text-sm mt-1">
              Join an ongoing story or start your own
            </p>
          </div>
          <a
            href="/scenes/new"
            class="bg-gradient-to-r from-primary to-orange-600 hover:from-primary/90 hover:to-orange-600/90 text-white font-bold py-2.5 px-6 rounded-full shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-all duration-300 uppercase tracking-wider text-xs flex items-center gap-2 transform hover:-translate-y-0.5"
          >
            <span class="text-lg leading-none">+</span> Start Scene
          </a>
        </div>

        {scenes.length === 0
          ? (
            <div class="text-center py-20 text-slate-500 bg-slate-900/40 rounded-3xl border border-white/5 backdrop-blur-sm animate-fade-in">
              <div class="text-5xl mb-4 opacity-20">🎭</div>
              <p class="text-lg font-medium">No active scenes at the moment.</p>
              <p class="text-sm mt-2 opacity-60">Be the first to start one!</p>
            </div>
          )
          : (
            <div class="grid grid-cols-1 gap-4">
              {scenes.map((scene) => (
                <a
                  href={`/scenes/${scene.id}`}
                  key={scene.id}
                  class="block group"
                >
                  <div class="bg-slate-900/60 border border-white/5 rounded-2xl p-6 hover:bg-slate-900/80 hover:border-white/10 transition-all duration-300 relative overflow-hidden shadow-sm hover:shadow-xl hover:shadow-primary/5 backdrop-blur-md group-hover:-translate-y-0.5 animate-fade-in-up">
                    {/* Status Indicator */}
                    <div class="absolute top-6 right-6 z-10">
                      <span
                        class={`text-[0.6rem] font-bold px-2.5 py-1 rounded-full border uppercase tracking-widest shadow-lg ${
                          scene.status === "active"
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20 shadow-emerald-500/10"
                            : "bg-slate-500/10 text-slate-400 border-slate-500/20"
                        }`}
                      >
                        {scene.status}
                      </span>
                    </div>

                    <div class="flex flex-col md:flex-row md:items-center gap-6 relative z-0">
                      {/* Scene Info */}
                      <div class="flex-grow space-y-3">
                        <div class="flex items-center gap-3 text-xs text-slate-500 font-mono">
                          <span class="opacity-70">#{scene.id}</span>
                          <span class="w-1 h-1 rounded-full bg-slate-700">
                          </span>
                          <span>
                            {new Date(scene.startTime).toLocaleDateString(
                              undefined,
                              {
                                year: "numeric",
                                month: "short",
                                day: "numeric",
                              },
                            )}
                          </span>
                          {scene.private && (
                            <span class="bg-amber-500/10 text-amber-500 border border-amber-500/20 px-1.5 py-0.5 rounded text-[0.55rem] uppercase font-bold tracking-widest flex items-center gap-1 ml-2">
                              🔒 Private
                            </span>
                          )}
                        </div>

                        <div>
                          <h2 class="text-2xl font-header font-bold text-white group-hover:text-primary transition-colors tracking-tight">
                            {scene.name}
                          </h2>
                          {scene.desc && (
                            <p class="text-slate-400 text-sm mt-2 line-clamp-2 max-w-2xl leading-relaxed">
                              {scene.desc}
                            </p>
                          )}
                        </div>

                        <div class="flex items-center gap-2 pt-2">
                          <div class="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/5 text-xs">
                            <span class="text-slate-500 font-bold uppercase tracking-wider text-[0.6rem]">
                              Loc
                            </span>
                            <span class="text-slate-300 font-medium">
                              {scene.location}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Participants */}
                      <div class="flex -space-x-3 items-center pl-2">
                        {scene.participants.slice(0, 4).map((_, i) => (
                          <div
                            key={i}
                            class="w-10 h-10 rounded-full bg-slate-800 border-2 border-slate-900 flex items-center justify-center text-xs text-white shadow-lg relative transform transition-transform hover:scale-110 hover:z-10 cursor-help"
                            title="Participant"
                          >
                            <span class="font-bold opacity-50">?</span>
                          </div>
                        ))}
                        {scene.participants.length > 4 && (
                          <div class="w-10 h-10 rounded-full bg-slate-800 border-2 border-slate-900 flex items-center justify-center text-[0.65rem] text-slate-400 font-bold shadow-lg">
                            +{scene.participants.length - 4}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </a>
              ))}
            </div>
          )}
      </div>
    </Layout>
  );
}

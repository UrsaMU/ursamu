import { Head } from "$fresh/runtime.ts";
import { Handlers, PageProps } from "$fresh/server.ts";
import Layout from "../../components/Layout.tsx";

interface WikiData {
  topics: string[];
}

export const handler: Handlers<WikiData> = {
  async GET(_, ctx) {
    try {
      const res = await fetch("http://localhost:4203/api/v1/wiki");
      if (!res.ok) throw new Error("Failed to fetch wiki topics");
      const topics = await res.json();
      return ctx.render({ topics });
    } catch (e) {
      console.error(e);
      return ctx.render({ topics: [] });
    }
  },
};

export default function WikiList({ data, url }: PageProps<WikiData>) {
  return (
    <Layout currentPath={url.pathname}>
      <Head>
        <title>UrsaMU - Wiki</title>
      </Head>
      <div class="max-w-6xl mx-auto">
        <div class="mb-12 text-center md:text-left">
          <h1 class="text-4xl font-header font-bold text-transparent bg-clip-text bg-gradient-to-r from-white to-slate-400 mb-2 uppercase tracking-tight">
            Knowledge Base
          </h1>
          <p class="text-slate-400 text-lg">
            Explore the lore, mechanics, and guides of the UrsaMU universe.
          </p>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {data.topics.map((topic) => (
            <a
              href={`/wiki/${encodeURIComponent(topic)}`}
              class="group relative block bg-slate-900/60 backdrop-blur-md p-8 rounded-3xl border border-white/5 hover:border-white/10 transition-all duration-300 shadow-lg hover:shadow-2xl hover:shadow-primary/5 hover:-translate-y-1 overflow-hidden"
            >
              <div class="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
              </div>

              <div class="relative z-10 flex flex-col h-full justify-between gap-4">
                <div>
                  <h2 class="text-xl font-bold text-white group-hover:text-primary transition-colors mb-2">
                    {topic}
                  </h2>
                  <div class="w-12 h-1 bg-white/10 group-hover:bg-primary/50 rounded-full transition-colors">
                  </div>
                </div>

                <div class="flex items-center text-xs font-bold uppercase tracking-wider text-slate-500 group-hover:text-slate-300 transition-colors">
                  <span>Read Article</span>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="w-4 h-4 ml-2 transform group-hover:translate-x-1 transition-transform"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                    <polyline points="12 5 19 12 12 19"></polyline>
                  </svg>
                </div>
              </div>
            </a>
          ))}
        </div>

        {data.topics.length === 0 && (
          <div class="text-center py-20 text-slate-500 bg-slate-900/40 rounded-3xl border border-white/5 backdrop-blur-sm animate-fade-in">
            <div class="text-5xl mb-4 opacity-20">📚</div>
            <p class="text-lg font-medium">No articles found.</p>
          </div>
        )}
      </div>
    </Layout>
  );
}

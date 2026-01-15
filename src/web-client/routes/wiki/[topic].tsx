import { Head } from "$fresh/runtime.ts";
import { Handlers, PageProps } from "$fresh/server.ts";
import { marked } from "https://esm.sh/marked@9.1.2";
import Layout from "../../components/Layout.tsx";

interface WikiPageData {
  topic: string;
  content: string;
}

export const handler: Handlers<WikiPageData> = {
  async GET(_, ctx) {
    const { topic } = ctx.params;
    try {
      const res = await fetch(
        `http://localhost:4203/api/v1/wiki/${encodeURIComponent(topic)}`,
      );
      if (!res.ok) throw new Error("Failed to fetch topic");
      const data = await res.json();
      return ctx.render({ topic: data.topic, content: data.content });
    } catch (e) {
      console.error(e);
      return ctx.renderNotFound();
    }
  },
};

export default function WikiPage({ data, url }: PageProps<WikiPageData>) {
  const htmlContent = marked.parse(data.content);

  return (
    <Layout currentPath={url.pathname}>
      <Head>
        <title>{data.topic} - UrsaMU Wiki</title>
      </Head>
      <div class="max-w-5xl mx-auto">
        {/* Header / Nav */}
        <div class="mb-8">
          <a
            href="/wiki"
            class="inline-flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-sm font-bold uppercase tracking-wider mb-6 group"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="w-4 h-4 transform group-hover:-translate-x-1 transition-transform"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <line x1="19" y1="12" x2="5" y2="12"></line>
              <polyline points="12 19 5 12 12 5"></polyline>
            </svg>
            Back to Knowledge Base
          </a>

          <h1 class="text-5xl font-header font-bold text-white mb-2 tracking-tight">
            {data.topic}
          </h1>
          <div class="w-24 h-1.5 bg-gradient-to-r from-primary to-transparent rounded-full opacity-80">
          </div>
        </div>

        {/* Content */}
        <div class="relative group">
          <div class="absolute -inset-1 bg-gradient-to-br from-primary/10 to-transparent rounded-3xl blur-xl opacity-20 group-hover:opacity-30 transition-opacity">
          </div>
          <div class="relative bg-slate-900/60 backdrop-blur-xl p-8 md:p-12 rounded-3xl border border-white/5 shadow-2xl">
            {/* prose-invert automatically styles dark mode markdown */}
            {/* We add customized spacing and font styles via utility classes if needed, but prose usually handles it well */}
            {/* deno-lint-ignore react-no-danger */}
            <div
              class="prose prose-invert prose-lg max-w-none 
                       prose-headings:font-header prose-headings:font-bold prose-headings:tracking-tight 
                       prose-a:text-primary prose-a:no-underline hover:prose-a:underline
                       prose-strong:text-white prose-code:text-white prose-code:bg-white/10 prose-code:px-1 prose-code:rounded prose-code:font-mono
                       prose-pre:bg-black/50 prose-pre:border prose-pre:border-white/10
                       text-slate-300 leading-relaxed font-sans"
              dangerouslySetInnerHTML={{ __html: htmlContent }}
            />
          </div>
        </div>
      </div>
    </Layout>
  );
}

import { Head } from "$fresh/runtime.ts";
import { Handlers, PageProps } from "$fresh/server.ts";

interface WikiPageData {
  topic: string;
  content: string;
}

export const handler: Handlers<WikiPageData> = {
  async GET(_, ctx) {
    const { topic } = ctx.params;
    try {
        const res = await fetch(`http://localhost:4203/api/v1/wiki/${encodeURIComponent(topic)}`);
        if (!res.ok) throw new Error("Failed to fetch topic");
        const data = await res.json();
        return ctx.render({ topic: data.topic, content: data.content });
    } catch (e) {
        console.error(e);
        return ctx.renderNotFound();
    }
  },
};

export default function WikiPage({ data }: PageProps<WikiPageData>) {
  return (
    <>
      <Head>
        <title>{data.topic} - UrsaMU Wiki</title>
        <link rel="stylesheet" href="/styles.css" />
        <script src="https://cdn.tailwindcss.com"></script>
      </Head>
      <div class="min-h-screen bg-gray-900 p-4 text-gray-200">
        <header class="max-w-4xl mx-auto mb-8 flex justify-between items-center border-b border-gray-700 pb-4">
            <h1 class="text-xl font-bold text-gray-400">
                <a href="/wiki" class="hover:text-purple-400">UrsaMU Wiki</a> 
                <span class="mx-2 text-gray-600">/</span>
                <span class="text-white">{data.topic}</span>
            </h1>
            <div class="space-x-4">
                <a href="/" class="text-gray-400 hover:text-white">Client</a>
            </div>
        </header>

        <main class="max-w-4xl mx-auto">
            <div class="bg-gray-800 p-8 rounded shadow-xl border border-gray-700">
                <pre class="whitespace-pre-wrap font-mono text-sm leading-relaxed text-gray-300">
                    {data.content}
                </pre>
            </div>
        </main>
      </div>
    </>
  );
}

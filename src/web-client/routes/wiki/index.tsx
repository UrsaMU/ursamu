import { Head } from "$fresh/runtime.ts";
import { Handlers, PageProps } from "$fresh/server.ts";

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

export default function WikiList({ data }: PageProps<WikiData>) {
  return (
    <>
      <Head>
        <title>UrsaMU Wiki</title>
        <link rel="stylesheet" href="/styles.css" />
        <script src="https://cdn.tailwindcss.com"></script>
      </Head>
      <div class="min-h-screen bg-gray-900 p-4 text-gray-200">
        <header class="max-w-4xl mx-auto mb-8 flex justify-between items-center border-b border-gray-700 pb-4">
            <h1 class="text-2xl font-bold text-purple-400">UrsaMU Wiki</h1>
            <div class="space-x-4">
                <a href="/" class="text-gray-400 hover:text-white">Client</a>
                <a href="/sheet" class="text-gray-400 hover:text-white">Char Sheet</a>
            </div>
        </header>

        <main class="max-w-4xl mx-auto">
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {data.topics.map((topic) => (
                    <a href={`/wiki/${encodeURIComponent(topic)}`} class="block bg-gray-800 p-4 rounded hover:bg-gray-700 border border-gray-700 hover:border-purple-500 transition">
                        <span class="text-lg font-mono text-green-400">{topic}</span>
                    </a>
                ))}
            </div>
        </main>
      </div>
    </>
  );
}

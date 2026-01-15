import { Head } from "$fresh/runtime.ts";
import CharacterSheet from "../islands/CharacterSheet.tsx";
import Layout from "../components/Layout.tsx";

export default function SheetPage() {
  return (
    <Layout currentPath="/sheet">
      <Head>
        <title>UrsaMU Character Sheet</title>
        <link rel="stylesheet" href="/styles.css" />
        <script src="https://cdn.tailwindcss.com"></script>
      </Head>
      <div class="min-h-screen bg-gray-900 p-4">
        <header class="max-w-4xl mx-auto mb-4 flex justify-between items-center">
          <h1 class="text-xl text-gray-500 font-mono">UrsaMU Portal</h1>
          <a href="/" class="text-purple-400 hover:text-purple-300">
            Back to Client
          </a>
        </header>
        <CharacterSheet />
      </div>
    </Layout>
  );
}

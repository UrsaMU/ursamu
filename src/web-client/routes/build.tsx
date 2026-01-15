import { PageProps } from "$fresh/server.ts";
import SceneBuilder from "../islands/SceneBuilder.tsx";
import Layout from "../components/Layout.tsx";

export default function BuildPage(props: PageProps) {
  return (
    <Layout currentPath="/build">
      <div class="h-full bg-slate-950 text-white font-sans p-4 md:p-8 overflow-y-auto">
        <div class="max-w-4xl mx-auto">
          <h1 class="text-3xl font-bold font-header mb-8 text-secondary">
            World Builder
          </h1>
          <p class="mb-6 text-slate-400">
            Create new locations for scenes or grid expansion.
          </p>
          <SceneBuilder />
        </div>
      </div>
    </Layout>
  );
}

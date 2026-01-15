import { Head } from "$fresh/runtime.ts";
import Layout from "../../components/Layout.tsx";

// Simple client-side only form for now via Island later?
// Or just standard HTML form with fetch script inside a script tag (simple for now) or Island.
// I'll make an Island for the form to handle submission cleanly.

import CreateSceneForm from "../../islands/CreateSceneForm.tsx";

export default function NewScene() {
  return (
    <Layout>
      <Head>
        <title>UrsaMU - Create Scene</title>
      </Head>

      <div class="max-w-2xl mx-auto space-y-6">
        <div class="border-b border-white/10 pb-4">
          <h1 class="text-3xl font-header font-bold text-white uppercase tracking-wider">
            Start New Scene
          </h1>
          <p class="text-slate-400 mt-2">
            Set the stage for your roleplay. Scenes are public and can be joined
            by anyone in the location.
          </p>
        </div>

        <div class="bg-white/5 border border-white/10 rounded-lg p-6">
          <CreateSceneForm />
        </div>
      </div>
    </Layout>
  );
}

import { Head } from "$fresh/runtime.ts";
import { Handlers, PageProps } from "$fresh/server.ts";
import Layout from "../../components/Layout.tsx";
import ScenePlayer from "../../islands/ScenePlayer.tsx";
import { IScene } from "../../../@types/IScene.ts";

interface ScenePageData {
  id: string;
  scene: IScene | null;
  error?: string;
}

export const handler: Handlers<ScenePageData> = {
  async GET(_, ctx) {
    const { id } = ctx.params;
    try {
      const res = await fetch(`http://localhost:4203/api/v1/scenes/${id}`);
      if (!res.ok) {
        // Even if 404/401, start with null scene so client can try fetching with token
        return ctx.render({ id, scene: null, error: "Scene not found." });
      }
      const scene = await res.json();
      return ctx.render({ id, scene });
    } catch (e) {
      console.error("Error fetching scene:", e);
      return ctx.render({ id, scene: null, error: "Error loading scene." });
    }
  },
};

export default function SceneView({ data }: PageProps<ScenePageData>) {
  const { scene, error, id } = data;

  // Fallback: If error is 401 or "Scene not found" might be auth issue or just not loaded yet,
  // we render the player anyway and let it fetch with client token.
  if (error && error !== "Scene not found.") {
    // Check if it's a real error vs just missing/unauth
  }

  return (
    <Layout>
      <Head>
        <title>UrsaMU - Scene #{id}</title>
      </Head>

      <div class="h-[calc(100vh-6rem)] py-2">
        {/* Island handles the interactive player */}
        <ScenePlayer initialScene={scene} sceneId={id} userId="current-user" />
      </div>
    </Layout>
  );
}

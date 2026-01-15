import { Head } from "$fresh/runtime.ts";
import GameClient from "../islands/GameClient.tsx";
import Layout from "../components/Layout.tsx";

export default function Play() {
  return (
    <Layout currentPath="/play">
      <Head>
        <title>UrsaMU - Play Now</title>
      </Head>
      <GameClient />
    </Layout>
  );
}

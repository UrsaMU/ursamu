import { Head } from "$fresh/runtime.ts";
import EditPage from "../../islands/EditPage.tsx";

import Layout from "../../components/Layout.tsx";

export default function EditorRoute({ url }: { url: URL }) {
  return (
    <>
      <Head>
        <title>UrsaMU Editor</title>
        <link rel="stylesheet" href="/styles.css" />
        <script src="https://cdn.tailwindcss.com"></script>
      </Head>
      <Layout currentPath={url.pathname}>
        <EditPage />
      </Layout>
    </>
  );
}

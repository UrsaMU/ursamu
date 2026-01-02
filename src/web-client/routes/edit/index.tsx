import { Head } from "$fresh/runtime.ts";
import EditPage from "../../islands/EditPage.tsx";

export default function EditorRoute() {
  return (
    <>
      <Head>
        <title>UrsaMU Editor</title>
        <link rel="stylesheet" href="/styles.css" />
        <script src="https://cdn.tailwindcss.com"></script>
      </Head>
      <EditPage />
    </>
  );
}

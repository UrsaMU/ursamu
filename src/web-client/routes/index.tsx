import { Head } from "$fresh/runtime.ts";
import GameClient from "../islands/GameClient.tsx";

export default function Home() {
  return (
    <>
      <Head>
        <title>UrsaMU Modern Client</title>
        <link rel="stylesheet" href="/styles.css" />
        <script src="https://cdn.tailwindcss.com"></script> {/* Quick Tailwind for styles since we avoided it in init but implemented classes */}
      </Head>
      <GameClient />
    </>
  );
}

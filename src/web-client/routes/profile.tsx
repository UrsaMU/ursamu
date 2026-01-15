import { Head } from "$fresh/runtime.ts";
import Layout from "../components/Layout.tsx";
import ProfileIsland from "../islands/Profile.tsx";

export default function ProfilePage() {
  return (
    <Layout>
      <Head>
        <title>UrsaMU - My Profile</title>
      </Head>
      <ProfileIsland />
    </Layout>
  );
}

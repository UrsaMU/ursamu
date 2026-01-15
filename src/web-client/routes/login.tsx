import { Head } from "$fresh/runtime.ts";
import { PageProps } from "$fresh/server.ts";
import Layout from "../components/Layout.tsx";
import LoginForm from "../islands/LoginForm.tsx";

export default function Login({ url }: PageProps) {
  return (
    <Layout noSidebar currentPath={url.pathname}>
      <Head>
        <title>UrsaMU - Login</title>
      </Head>
      <LoginForm />
    </Layout>
  );
}

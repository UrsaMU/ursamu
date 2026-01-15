import { Head } from "$fresh/runtime.ts";
import { PageProps } from "$fresh/server.ts";
import Layout from "../components/Layout.tsx";
import RegisterForm from "../islands/RegisterForm.tsx";

export default function Register({ url }: PageProps) {
  return (
    <Layout noSidebar currentPath={url.pathname}>
      <Head>
        <title>UrsaMU - Register</title>
      </Head>
      <RegisterForm />
    </Layout>
  );
}

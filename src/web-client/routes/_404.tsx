import { Head } from "$fresh/runtime.ts";
import { Handler, PageProps } from "$fresh/server.ts";
import { marked } from "https://esm.sh/marked@9.1.2";
import Layout from "../components/Layout.tsx";

interface Error404Data {
  text: string;
}

const DEFAULT_404_CONTENT = `
# 404
## Signal Lost

We've scanned the sector, but the coordinates you provided lead to deep space.

<Button href="/" variant="primary">Return to Base</Button>
`;

export const handler: Handler<Error404Data> = async (_req, ctx) => {
  let text = DEFAULT_404_CONTENT;
  try {
    const res = await fetch("http://localhost:4203/api/v1/404");
    if (res.ok) {
      const data = await res.json();
      if (data.text) text = data.text;
    }
  } catch (e) {
    console.error("Error fetching 404 text:", e);
  }
  return ctx.render({ text });
};

export default function Error404({ url, data }: PageProps<Error404Data>) {
  // Use fetched data or fall back to default if data is missing (though handler handles this)
  let content = data?.text || DEFAULT_404_CONTENT;

  // Transform <Button> tags
  const buttonPattern = /<Button\s+([^>]+)>(.*?)<\/Button>/g;
  content = content.replace(buttonPattern, (_, attributes, text) => {
    const hrefMatch = attributes.match(/href=["'](.*?)["']/);
    const href = hrefMatch ? hrefMatch[1] : "#";
    const variantMatch = attributes.match(/variant=["'](.*?)["']/);
    const variant = variantMatch ? variantMatch[1] : "primary";
    const btnClass = variant === "secondary"
      ? "btn btn-secondary"
      : "btn btn-primary px-8 py-3 text-sm font-bold tracking-widest uppercase";
    return `<div class="pt-4"><a href="${href}" class="${btnClass}">${text}</a></div>`;
  });

  const htmlContent = marked.parse(content);

  return (
    <Layout currentPath={url.pathname} noSidebar>
      <Head>
        <title>404 - Page not found</title>
      </Head>
      <div class="w-full flex-grow flex flex-col justify-center items-center py-20">
        <div class="max-w-3xl w-full">
          <div class="space-y-6 text-center animate-fade-in-up">
            <div
              class="content 404-content"
              dangerouslySetInnerHTML={{ __html: htmlContent }}
            />

            {/* Styles for the injected content to match previous design */}
            <style
              dangerouslySetInnerHTML={{
                __html: `
                  .content h1 {
                    font-size: 6rem;
                    line-height: 1;
                    font-family: var(--font-header);
                    font-weight: 700;
                    color: transparent;
                    background-clip: text;
                    -webkit-background-clip: text;
                    background-image: linear-gradient(to bottom right, #ffffff, #e2e8f0, #475569);
                    filter: drop-shadow(0 10px 10px rgb(0 0 0 / 0.15));
                    margin-bottom: 0.5rem;
                    position: relative;
                    display: inline-block;
                  }
                  .content h2 {
                    font-size: 1.875rem;
                    line-height: 2.25rem;
                    font-weight: 700;
                    color: white;
                    letter-spacing: 0.025em;
                    text-transform: uppercase;
                    margin-bottom: 1rem;
                  }
                  .content p {
                    color: #94a3b8;
                    font-size: 1.125rem;
                    line-height: 1.75rem;
                    max-width: 32rem;
                    margin-left: auto;
                    margin-right: auto;
                  }
                `,
              }}
            />
          </div>
        </div>
      </div>
    </Layout>
  );
}

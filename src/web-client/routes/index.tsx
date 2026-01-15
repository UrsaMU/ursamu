// ... imports ...
import { Head } from "$fresh/runtime.ts";
import { Handlers, PageProps } from "$fresh/server.ts";
import { marked } from "https://esm.sh/marked@9.1.2";

import Layout from "../components/Layout.tsx";

interface WelcomeData {
  text: string;
}

export const handler: Handlers<WelcomeData> = {
  async GET(_, ctx) {
    let text = "";
    try {
      const res = await fetch("http://localhost:4203/api/v1/welcome");
      const data = await res.json();
      text = data.text || "# Welcome to UrsaMU\n\nYour journey begins here.";
    } catch (e) {
      console.error("Error fetching welcome:", e);
      text = "# Connection Error\n\nCould not load welcome message.";
    }
    return ctx.render({ text });
  },
};

export default function Home({ data, url }: PageProps<WelcomeData>) {
  // Simple parser to extract the first image as background if it exists at the start
  let content = data.text;
  let bgImage =
    "https://images.unsplash.com/photo-1614728263952-84ea256f9679?q=80&w=2608&auto=format&fit=crop"; // Default

  // Check for markdown image at start: ![alt](url)
  const imgRegex = /^!\[.*?\]\((.*?)\)\s*/;
  const match = content.match(imgRegex);

  if (match) {
    bgImage = match[1];
    content = content.replace(imgRegex, ""); // Remove the image from the text flow
  }

  // Transform <Button> tags to styled <a> tags (Poor man's MDX)
  const buttonPattern = /<Button\s+([^>]+)>(.*?)<\/Button>/g;

  content = content.replace(buttonPattern, (_, attributes, text) => {
    // Extract href
    const hrefMatch = attributes.match(/href=["'](.*?)["']/);
    const href = hrefMatch ? hrefMatch[1] : "#";

    // Extract variant
    const variantMatch = attributes.match(/variant=["'](.*?)["']/);
    const variant = variantMatch ? variantMatch[1] : "primary";

    const btnClass = variant === "secondary"
      ? "inline-flex items-center justify-center px-6 py-3 border border-white/10 text-base font-medium rounded-md text-text bg-surface/50 hover:bg-surface/80 backdrop-blur-sm transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900 focus:ring-white/10"
      : "inline-flex items-center justify-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-white bg-primary hover:bg-orange-700 shadow-lg shadow-orange-900/20 transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900 focus:ring-primary";

    return `<a href="${href}" class="${btnClass}">${text}</a>`;
  });

  const htmlContent = marked.parse(content);

  return (
    <Layout isLanding currentPath={url.pathname} noHero>
      <Head>
        <title>UrsaMU - Home</title>
      </Head>

      {/* Full Screen Welcome Section */}
      <div class="relative min-h-screen w-full overflow-hidden flex flex-col">
        
        {/* Hero Content */}
        <div class="flex-grow container mx-auto px-4 relative z-20 flex flex-col justify-center py-20">
          {/* Main Hero Content (Centered) - Standard Web Content */}
          <div class="space-y-8 animate-fade-in-up max-w-4xl mx-auto w-full">
            <div class="mb-8 hidden">
              {/* Connection Info - Prominent (Configurable) */}
            </div>

            {/* deno-lint-ignore react-no-danger */}
            <div
              class="content prose prose-invert prose-lg max-w-none text-muted"
              dangerouslySetInnerHTML={{ __html: htmlContent }}
            />
          </div>
        </div>
      </div>
    </Layout>
  );
}

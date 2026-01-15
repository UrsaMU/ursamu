import type { PageProps } from "$fresh/server.ts";

interface ThemeState {
  theme?: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    surface: string;
    text: string;
    muted: string;
    glass: string;
    glassBorder: string;
    backgroundImage?: string;
  };
}

export default function App(
  { Component, state }: PageProps<unknown, ThemeState>,
) {
  const theme = state.theme || {
    primary: "#f97316",
    secondary: "#27272a",
    accent: "#fb923c",
    background: "#000000",
    surface: "#09090b",
    text: "#fafafa",
    muted: "#a1a1aa",
    glass: "rgba(9, 9, 11, 0.7)",
    glassBorder: "rgba(255, 255, 255, 0.05)",
    backgroundImage: "/images/default_bg.jpg",
  };

  return (
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>UrsaMU</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossorigin="true"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Manrope:wght@300;400;500;600;700&family=Oxanium:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <script
          // deno-lint-ignore react-no-danger
          dangerouslySetInnerHTML={{
            __html: `
            tailwind.config = {
              theme: {
                extend: {
                  colors: {
                    primary: "#F59E0B", // Electric Amber
                    secondary: "${theme.secondary}", 
                    accent: "${theme.accent}", 
                    background: "#050505", 
                    surface: "#0A0A0A", 
                    text: "#ededed", 
                    muted: "#a1a1aa", 
                    "glass": "rgba(10, 10, 10, 0.7)",
                    "glass-border": "rgba(255, 255, 255, 0.08)",
                    "glass-highlight": "rgba(255, 255, 255, 0.03)",
                  },
                  backgroundImage: {
                    "site-bg": "url('/images/default_bg.jpg')",
                  },
                  fontFamily: {
                    sans: ["Manrope", "sans-serif"],
                    header: ["Oxanium", "sans-serif"],
                    mono: ["Fira Code", "monospace"],
                  },
                  backdropBlur: {
                    "xs": "2px",
                  },
                  animation: {
                    "fade-in": "fadeIn 0.5s ease-out forwards",
                    "fade-in-up": "fadeInUp 0.7s ease-out forwards",
                    "pulse-slow": "pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite",
                  },
                  keyframes: {
                    fadeIn: {
                      "0%": { opacity: "0" },
                      "100%": { opacity: "1" },
                    },
                    fadeInUp: {
                      "0%": { opacity: "0", transform: "translateY(10px)" },
                      "100%": { opacity: "1", transform: "translateY(0)" },
                    },
                  },
                },
              },
            }
          `,
          }}
        />
        <script src="https://cdn.tailwindcss.com"></script>
        <link rel="stylesheet" href="/styles.css" />
        <style>{`
          .bg-site-bg {
            background-image: url('/images/default_bg.jpg') !important;
          }
        `}</style>
      </head>
      <body>
        <Component />
      </body>
    </html>
  );
}

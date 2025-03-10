/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./_includes/**/*.{njk,md}",
    "./**/*.{md,njk}",
  ],
  theme: {
    extend: {
      typography: {
        DEFAULT: {
          css: {
            maxWidth: 'none',
            color: '#94a3b8',
            a: {
              color: '#a78bfa',
              '&:hover': {
                color: '#c4b5fd',
              },
            },
            h1: {
              color: '#f8fafc',
            },
            h2: {
              color: '#f8fafc',
            },
            h3: {
              color: '#f8fafc',
            },
            h4: {
              color: '#f8fafc',
            },
            strong: {
              color: '#f8fafc',
            },
            code: {
              color: '#f8fafc',
            },
            blockquote: {
              color: '#94a3b8',
              borderLeftColor: '#334155',
            },
          },
        },
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
} 
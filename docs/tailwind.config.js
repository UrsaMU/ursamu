/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./_includes/**/*.{njk,md}",
    "./_layouts/**/*.{njk,md}",
    "./**/*.{md,njk}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
} 
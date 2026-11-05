import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0C2B45",
        deep: "#103B5E",
        lagoon: "#14B8D4",
        signal: "#FFC93C",
        mist: "#F1F8FB",
        line: "#D9E7EE",
        coral: "#EF5B4D",
      },
      fontFamily: {
        display: ['"Bricolage Grotesque"', "ui-sans-serif", "system-ui", "sans-serif"],
        sans: ['"Figtree"', "ui-sans-serif", "system-ui", "sans-serif"],
      },
      boxShadow: {
        lift: "0 24px 60px -24px rgba(12, 43, 69, 0.45)",
      },
    },
  },
  plugins: [],
};
export default config;

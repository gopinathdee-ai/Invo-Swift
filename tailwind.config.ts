import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Nunito", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      colors: {
        bg: "var(--bg)",
        surface: "var(--surface)",
        ink: "var(--ink)",
        "ink-muted": "var(--ink-muted)",
        border: "var(--border)",
        accent: "var(--accent)",
        secondary: "var(--secondary)",
      },
      backgroundColor: {
        "gradient-bg": "linear-gradient(135deg, #ecf0f7 0%, #e0e7f1 50%, #f5f1fa 100%)",
      },
    },
  },
  plugins: [],
};

export default config;

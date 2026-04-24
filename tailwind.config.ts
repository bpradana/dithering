import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "hsl(40 33% 97%)",
        foreground: "hsl(15 24% 15%)",
        card: "hsl(0 0% 100% / 0.72)",
        "card-foreground": "hsl(15 24% 15%)",
        border: "hsl(28 26% 82%)",
        input: "hsl(28 26% 82%)",
        primary: "hsl(16 74% 42%)",
        "primary-foreground": "hsl(40 60% 98%)",
        secondary: "hsl(35 54% 92%)",
        "secondary-foreground": "hsl(15 24% 15%)",
        muted: "hsl(40 24% 92%)",
        "muted-foreground": "hsl(18 12% 38%)",
        accent: "hsl(191 56% 30%)",
        "accent-foreground": "hsl(40 60% 98%)",
        ring: "hsl(16 74% 42%)",
      },
      borderRadius: {
        lg: "1.25rem",
        md: "1rem",
        sm: "0.75rem",
      },
      boxShadow: {
        paper: "0 18px 50px rgba(79, 54, 36, 0.12)",
      },
      fontFamily: {
        sans: ["'Plus Jakarta Sans'", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      backgroundImage: {
        grain:
          "radial-gradient(circle at 1px 1px, rgba(101, 67, 33, 0.06) 1px, transparent 0)",
      },
    },
  },
  plugins: [],
};

export default config;

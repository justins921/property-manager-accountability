import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef4ff",
          100: "#d9e6ff",
          200: "#bcd3ff",
          300: "#8eb6ff",
          400: "#598dff",
          500: "#3563ff",
          600: "#1e40f5",
          700: "#172fe1",
          800: "#1929b6",
          900: "#1b298f",
        },
        status: {
          green: "#16a34a",
          yellow: "#d97706",
          red: "#dc2626",
        },
      },
    },
  },
  plugins: [],
};

export default config;

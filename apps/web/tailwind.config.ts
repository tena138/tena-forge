import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        graphite: "#070707",
        ink: "#101010",
        bone: "#F6F6F3"
      },
      borderRadius: {
        forge: "8px"
      },
      boxShadow: {
        forge: "0 24px 90px rgba(0,0,0,0.48)"
      }
    }
  },
  plugins: []
};

export default config;

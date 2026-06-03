import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({
  baseDirectory: dirname(fileURLToPath(import.meta.url))
});

const config = [
  {
    ignores: [
      ".next/**",
      ".next-dev/**",
      "node_modules/**",
      "out/**",
      "dist/**",
      "scripts/**",
      "**/*.test.mjs"
    ]
  },
  ...compat.extends("next/core-web-vitals"),
  {
    rules: {
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/immutability": "off",
      "react-hooks/refs": "off",
      "react-hooks/purity": "off",
      "react-hooks/use-memo": "off",
      "react/no-unescaped-entities": "off"
    }
  }
];

export default config;

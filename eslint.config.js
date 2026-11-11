import js from "@eslint/js";

export default [
  { ignores: ["dist/**", "node_modules/**", "coverage/**"] },
  js.configs.recommended,
  {
    files: ["**/*.js", "**/*.mjs"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        console: "readonly",
        document: "readonly",
        window: "readonly",
        customElements: "readonly",
        HTMLElement: "readonly",
        performance: "readonly",
        queueMicrotask: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        globalThis: "readonly",
        structuredClone: "readonly",
        process: "readonly",
        Buffer: "readonly",
        URL: "readonly",
      },
    },
  },
];

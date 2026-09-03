import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // OpenNext's generated Worker bundle — build output, not source. It inlines Next's own
    // server runtime, which trips ~1000 rules that say nothing about this codebase.
    ".open-next/**",
    ".wrangler/**",
  ]),
]);

export default eslintConfig;

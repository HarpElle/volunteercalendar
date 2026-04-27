import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  // Project-wide rule tuning. These rules are downgraded from error → warn
  // so CI can enforce real correctness errors (rules-of-hooks, undefined
  // references, type errors) without being blocked by stylistic / advisory
  // rules. They still appear in PR review and can be cleaned up over time.
  {
    rules: {
      // Apostrophes/quotes in JSX text. Stylistic only; visible in source,
      // not a runtime concern. Auto-fix sometimes can't process them in
      // ternaries or template literals.
      "react/no-unescaped-entities": "warn",
      // React Compiler advisories about cascading renders / memoization.
      // Legitimate concerns but pre-existing patterns get flagged; warn
      // while adopting the compiler more carefully.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
      "react-hooks/incompatible-library": "warn",
    },
  },
]);

export default eslintConfig;

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
      // Discourage raw console.* — prefer src/lib/log.ts so logs are
      // structured + Sentry-routed. Warn (not error) so CI keeps flowing
      // while we sweep the ~228 existing call sites; allow `warn`/`error`
      // for the moment so the warning count tracks only `console.log`-ish
      // chatter. The sweep over time replaces these with `log.warn`/`log.error`.
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },
  // The log wrapper itself, Sentry instrumentation, and CLI scripts all
  // legitimately use console.* — silence the rule for them so the warning
  // count reflects actual call sites we want to migrate.
  {
    files: [
      "src/lib/log.ts",
      "instrumentation.ts",
      "instrumentation-client.ts",
      "scripts/**/*.{ts,js,mjs}",
      "tests/**/*.{ts,js,mjs}",
    ],
    rules: {
      "no-console": "off",
    },
  },
]);

export default eslintConfig;

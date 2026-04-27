import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Vitest configuration for VolunteerCal.
 *
 * Test types:
 *   - Unit tests (`tests/unit/**`) — pure-function tests for src/lib/server/*
 *     and src/lib/utils/*. Run in node, no external dependencies.
 *   - Rules tests (`tests/rules/**`) — Firestore security rules tests using
 *     the Firebase emulator. Require `firebase emulators:exec` wrapper to
 *     start the emulator first.
 *
 * Run all: `npm test`
 * Unit only: `npm run test:unit`
 * Rules only: `npm run test:rules` (starts emulator)
 */
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    exclude: ["node_modules", ".next", "build"],
    globals: false,
    environment: "node",
    testTimeout: 15_000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});

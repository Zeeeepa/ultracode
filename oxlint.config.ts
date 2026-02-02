/**
 * Oxlint Configuration
 *
 * Fast TypeScript/JavaScript linter configuration.
 * Docs: https://oxc.rs/docs/guide/usage/linter.html
 */

export default {
  // Rules configuration
  rules: {
    // === Correctness (errors that should be fixed) ===
    "no-unused-vars": "error",
    "no-undef": "error",
    "no-constant-condition": "error",
    "no-unreachable": "error",

    // === Style (consistency, auto-fixable) ===
    "prefer-const": "warn", // Auto-fix available
    "no-useless-rename": "warn", // Auto-fix available

    // === TypeScript specific ===
    "@typescript-eslint/no-explicit-any": "off", // Allow any for flexibility
    "@typescript-eslint/no-unused-vars": "error",

    // === Import rules ===
    "import/no-nodejs-modules": "off", // Allow Node.js imports (this is a Node.js project)

    // === React rules (if needed) ===
    "react/display-name": "off",
    "react/no-multi-comp": "off",
  },

  // Ignore patterns
  ignorePatterns: [
    "**/node_modules/**",
    "**/dist/**",
    "**/build/**",
    "**/coverage/**",
    "**/*.d.ts",
    "**/*.config.js",
    "**/*.config.ts",
    "**/external-libs/**",
    "**/external-tools/**",
    "**/.git/**",
    "**/scripts/**", // Build scripts may have different style
    "**/benchmarks/**",
  ],

  // Language options
  languageOptions: {
    sourceType: "module",
    ecmaVersion: 2024,
  },
};

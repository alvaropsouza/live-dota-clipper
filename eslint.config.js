import tseslint from "@typescript-eslint/eslint-plugin"
import tsparser from "@typescript-eslint/parser"

export default [
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: { parser: tsparser },
    plugins: { "@typescript-eslint": tseslint },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-unused-vars": "error",
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "prefer-nullish-coalescing": "error",
      eqeqeq: "error",
    },
  },
  { ignores: ["**/dist/**", "**/node_modules/**"] },
]

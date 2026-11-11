import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    // ไฟล์ที่สร้างอัตโนมัติและโปรเจกต์ native ไม่ต้องตรวจ
    ignores: ["dist/", "node_modules/", "android/", "ios/", ".claude/", ".tmp/"]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/consistent-type-imports": ["error", { fixStyle: "inline-type-imports" }],
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "no-console": ["error", { allow: ["warn", "error"] }],
      eqeqeq: "error"
    }
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: { globals: globals.browser },
    plugins: { "react-hooks": reactHooks },
    rules: reactHooks.configs.recommended.rules
  },
  {
    files: ["server/**/*.ts", "*.config.{js,ts}"],
    languageOptions: { globals: globals.node }
  },
  {
    // เซิร์ฟเวอร์ต้องพิมพ์บรรทัดเริ่มทำงานให้ผู้ดูแลเห็น
    files: ["server/index.ts"],
    rules: { "no-console": "off" }
  }
);

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
    files: ["server/**/*.ts", "api/**/*.ts", "scripts/**/*.mjs", "*.config.{js,ts}"],
    languageOptions: { globals: globals.node }
  },
  {
    // ชุดตรวจในเบราว์เซอร์จริง: โค้ดส่วนหนึ่งรันใน Node อีกส่วนถูกส่งไปรันในหน้าเว็บ จึงใช้ตัวแปรของทั้งสองที่ และพิมพ์ผลออกทางคอนโซล
    files: ["e2e/**/*.mjs"],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: { "no-console": "off" }
  },
  {
    // โปรเซสหลักของแอปเดสก์ท็อป (Electron) เป็น CommonJS
    files: ["desktop/**/*.cjs"],
    languageOptions: { sourceType: "commonjs", globals: globals.node },
    rules: { "@typescript-eslint/no-require-imports": "off" }
  },
  {
    // เซิร์ฟเวอร์ต้องพิมพ์บรรทัดเริ่มทำงานและผลตรวจบัญชี AI ให้ผู้ดูแลเห็น
    files: ["server/index.ts", "server/accountMonitor.ts"],
    rules: { "no-console": "off" }
  }
);

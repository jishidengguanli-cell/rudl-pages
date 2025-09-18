/* rudl-pages/.eslintrc.cjs */
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: { project: ['./tsconfig.json'], ecmaVersion: 'latest', sourceType: 'module' },
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  env: { worker: true, es2022: true },   // Cloudflare Workers 環境
  rules: {
    'no-undef': 'off'                    // 交給 TypeScript 檢查，避免誤判型別名稱
  },
  ignorePatterns: ['node_modules/', 'public/', '**/*.js']
};

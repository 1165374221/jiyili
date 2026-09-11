import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      // AppContext.tsx 有意把 Provider 和配套的 hook 放在同一个文件里（该文件
      // 一直如此）。这正是 fast-refresh 规则 allowExportNames 的适用场景，比为了
      // 满足规则把文件拆成 contexts/app.ts + AppProvider.tsx 更可读。
      'react-refresh/only-export-components': ['error', {
        allowExportNames: ['useApp', 'useCommand', 'useConsole'],
      }],
    },
  },
])

/// <reference types="vitest/config" />
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

// https://vite.dev/config/
// `base` se puede fijar en build con `--base /olivetwin/` (AT-17); el código
// resuelve rutas con import.meta.env.BASE_URL, nunca con "/" absoluto.
export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'jsdom',
    setupFiles: ['src/i18n/testSetup.ts'],
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts', 'scripts/**/*.test.{ts,mjs}'],
  },
})

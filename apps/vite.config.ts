/// <reference types="vitest/config" />
import { createRequire } from 'node:module'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// Read rather than imported: a JSON import here would need resolveJsonModule
// and import attributes turned on for a single string.
const pkg = createRequire(import.meta.url)('./package.json') as { version: string }

// Relative base so the built bundle also runs from file:// inside a Tauri shell.
export default defineConfig({
  base: './',
  plugins: [vue()],
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: { port: 5173, strictPort: false },
  test: {
    environment: 'jsdom',
    // Tests sit next to the file they cover: foo.ts -> foo.test.ts
    include: ['src/**/*.test.ts'],
    globals: false,
  },
})

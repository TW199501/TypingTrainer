/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// Relative base so the built bundle also runs from file:// inside a Tauri shell.
export default defineConfig({
  base: './',
  plugins: [vue()],
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

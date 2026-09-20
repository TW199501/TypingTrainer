/// <reference types="vite/client" />

/**
 * The running version, substituted at build time from apps/package.json.
 *
 * `scripts/version.mjs` rewrites every version-bearing file together, so the
 * manifest is as authoritative here as tauri.conf.json is for the shell.
 */
declare const __APP_VERSION__: string

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>
  export default component
}

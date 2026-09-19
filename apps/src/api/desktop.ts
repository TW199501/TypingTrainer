/**
 * Bridge to the Tauri shell.
 *
 * The same bundle runs in a browser and inside the desktop app, so anything
 * that depends on having a real filesystem has to be asked for at runtime
 * rather than assumed. The Tauri API is imported dynamically so the browser
 * build never pulls it into the main chunk.
 */

/** True only inside the Tauri shell; `__TAURI_INTERNALS__` is injected by it. */
export const IS_DESKTOP = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

/**
 * Absolute path to the desktop model directory, or null in a browser.
 *
 * On desktop the files sit in the OS app-data directory and only the shell can
 * resolve it; in a browser the server answers instead, because that is where
 * the files actually are.
 */
export async function desktopModelDir(): Promise<string | null> {
  if (!IS_DESKTOP) return null
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    return await invoke<string>('model_dir')
  } catch {
    // A shell too old to expose the command must not break the page.
    return null
  }
}

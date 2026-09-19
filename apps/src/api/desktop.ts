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

/** An update the shell found; installing it stays the caller's decision. */
export type DesktopUpdate = {
  version: string
  notes: string
  /** Downloads and installs, reporting whole-number percentages as it goes. */
  install: (onProgress: (percent: number) => void) => Promise<void>
}

/**
 * Asks the updater endpoint for a newer bundle.
 *
 * Null in a browser — the web deployment updates by pulling new container
 * images, so there is nothing here to install. Unlike `desktopModelDir`,
 * failures propagate: a check that cannot reach the endpoint is worth showing
 * the user, whereas an unknown model directory is not.
 */
export async function checkDesktopUpdate(): Promise<DesktopUpdate | null> {
  if (!IS_DESKTOP) return null
  const { check } = await import('@tauri-apps/plugin-updater')
  const update = await check()
  if (!update) return null

  return {
    version: update.version,
    notes: update.body ?? '',
    install: async (onProgress) => {
      let got = 0
      let total = 0
      await update.downloadAndInstall((event) => {
        if (event.event === 'Started') {
          total = event.data.contentLength ?? 0
        } else if (event.event === 'Progress') {
          got += event.data.chunkLength
          // Held below 100 until the install itself returns, so the page never
          // claims it is done while the installer is still running.
          if (total) onProgress(Math.min(99, Math.floor((got / total) * 100)))
        }
      })
      // Only reached on macOS and Linux: the Windows installer takes over and
      // the process exits inside downloadAndInstall. Those two platforms
      // replace the bundle on disk and need a relaunch to run the new version.
      const { relaunch } = await import('@tauri-apps/plugin-process')
      await relaunch()
    },
  }
}

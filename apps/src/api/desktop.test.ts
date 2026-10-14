import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The updater bridge.
 *
 * `IS_DESKTOP` is evaluated when the module loads, so every test re-imports it
 * after setting up the window it expects. The Tauri plugins are mocked because
 * they only exist inside the shell.
 */

const relaunch = vi.fn()
const check = vi.fn()
const invoke = vi.fn()

vi.mock('@tauri-apps/api/core', () => ({ invoke }))
vi.mock('@tauri-apps/plugin-updater', () => ({ check }))
vi.mock('@tauri-apps/plugin-process', () => ({ relaunch }))

/** Loads the module with or without the marker the Tauri shell injects. */
async function importDesktop(inShell: boolean) {
  vi.resetModules()
  if (inShell) {
    ;(window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {}
  } else {
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__
  }
  return import('./desktop')
}

/** Steps the fake update and the backend stop record, in order. */
const steps: string[] = []

/** Minimal stand-in for the plugin's Update object. */
function fakeUpdate(events: { event: string; data: Record<string, number> }[]) {
  return {
    version: '1.2.3',
    body: 'Fixes the thing',
    download: vi.fn(async (onEvent: (e: unknown) => void) => {
      for (const e of events) onEvent(e)
      steps.push('downloaded')
    }),
    install: vi.fn(async () => {
      steps.push('installed')
    }),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  steps.length = 0
  invoke.mockImplementation(async (cmd: string) => {
    steps.push(cmd)
  })
})

afterEach(() => {
  delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__
})

describe('checkDesktopUpdate', () => {
  it('returns null in a browser without asking the plugin', async () => {
    const { checkDesktopUpdate } = await importDesktop(false)

    expect(await checkDesktopUpdate()).toBeNull()
    // The web deployment updates by pulling a new image; there is nothing to check.
    expect(check).not.toHaveBeenCalled()
  })

  it('returns null when the shell reports no newer bundle', async () => {
    check.mockResolvedValue(null)
    const { checkDesktopUpdate } = await importDesktop(true)

    expect(await checkDesktopUpdate()).toBeNull()
  })

  it('surfaces the version and notes when an update exists', async () => {
    check.mockResolvedValue(fakeUpdate([]))
    const { checkDesktopUpdate } = await importDesktop(true)

    const update = await checkDesktopUpdate()

    expect(update?.version).toBe('1.2.3')
    expect(update?.notes).toBe('Fixes the thing')
  })

  it('tolerates a bundle with no release notes', async () => {
    check.mockResolvedValue({ ...fakeUpdate([]), body: undefined })
    const { checkDesktopUpdate } = await importDesktop(true)

    expect((await checkDesktopUpdate())?.notes).toBe('')
  })

  /**
   * A failed check is worth showing: unlike an unknown model directory, the
   * user asked for this and deserves to know it did not work.
   */
  it('lets a failing check propagate rather than swallowing it', async () => {
    check.mockRejectedValue(new Error('endpoint unreachable'))
    const { checkDesktopUpdate } = await importDesktop(true)

    await expect(checkDesktopUpdate()).rejects.toThrow('endpoint unreachable')
  })
})

describe('install progress', () => {
  it('reports percentages from the accumulated chunk lengths', async () => {
    check.mockResolvedValue(
      fakeUpdate([
        { event: 'Started', data: { contentLength: 1000 } },
        { event: 'Progress', data: { chunkLength: 250 } },
        { event: 'Progress', data: { chunkLength: 250 } },
      ]),
    )
    const { checkDesktopUpdate } = await importDesktop(true)
    const update = await checkDesktopUpdate()

    const seen: number[] = []
    await update!.install((p) => seen.push(p))

    expect(seen).toEqual([25, 50])
  })

  /**
   * The bar is deliberately held below 100 until the install itself returns, so
   * the page never claims success while the installer is still running.
   */
  it('never reaches 100 from download progress alone', async () => {
    check.mockResolvedValue(
      fakeUpdate([
        { event: 'Started', data: { contentLength: 100 } },
        { event: 'Progress', data: { chunkLength: 100 } },
      ]),
    )
    const { checkDesktopUpdate } = await importDesktop(true)
    const update = await checkDesktopUpdate()

    const seen: number[] = []
    await update!.install((p) => seen.push(p))

    expect(seen).toEqual([99])
  })

  /** A server that omits Content-Length must not produce NaN or Infinity. */
  it('reports nothing rather than dividing by an unknown total', async () => {
    check.mockResolvedValue(
      fakeUpdate([
        { event: 'Started', data: {} },
        { event: 'Progress', data: { chunkLength: 500 } },
      ]),
    )
    const { checkDesktopUpdate } = await importDesktop(true)
    const update = await checkDesktopUpdate()

    const seen: number[] = []
    await update!.install((p) => seen.push(p))

    expect(seen).toEqual([])
  })

  it('relaunches after installing', async () => {
    check.mockResolvedValue(fakeUpdate([]))
    const { checkDesktopUpdate } = await importDesktop(true)
    const update = await checkDesktopUpdate()

    await update!.install(() => {})

    // Only reached on macOS and Linux; on Windows the installer takes over and
    // the process is gone before this line.
    expect(relaunch).toHaveBeenCalledOnce()
  })
})

describe('stopping the backend before an update', () => {
  it('stops the backend after the download and before the install', async () => {
    check.mockResolvedValue(fakeUpdate([]))
    const { checkDesktopUpdate } = await importDesktop(true)
    const found = await checkDesktopUpdate()

    await found!.install(() => {})

    // The installer replaces files the running API holds open, so it must be
    // gone first; a download that fails must leave it running.
    expect(steps).toEqual(['downloaded', 'stop_backend', 'installed'])
  })

  it('leaves the backend running when the download fails', async () => {
    const update = fakeUpdate([])
    update.download.mockRejectedValue(new Error('signature mismatch'))
    check.mockResolvedValue(update)
    const { checkDesktopUpdate } = await importDesktop(true)
    const found = await checkDesktopUpdate()

    await expect(found!.install(() => {})).rejects.toThrow('signature mismatch')

    expect(invoke).not.toHaveBeenCalled()
    expect(update.install).not.toHaveBeenCalled()
  })

  it('still installs when stop_backend fails', async () => {
    const update = fakeUpdate([])
    check.mockResolvedValue(update)
    invoke.mockRejectedValue('the backend did not exit within 7 s')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { checkDesktopUpdate } = await importDesktop(true)
    const found = await checkDesktopUpdate()

    await found!.install(() => {})

    expect(update.install).toHaveBeenCalledOnce()
    expect(relaunch).toHaveBeenCalledOnce()
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})

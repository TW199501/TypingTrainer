import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

/**
 * The screen shown when the bundled API cannot be reached.
 *
 * `IS_DESKTOP` is fixed when `desktop.ts` loads, so each test re-imports the
 * component after setting up the window it expects. The Tauri plugins are
 * mocked; `desktop.ts` itself is real, so installing goes through the same
 * download, stop, install path as the settings page.
 */

const relaunch = vi.fn()
const check = vi.fn()
const invoke = vi.fn()
vi.mock('@tauri-apps/plugin-process', () => ({ relaunch }))
vi.mock('@tauri-apps/plugin-updater', () => ({ check }))
vi.mock('@tauri-apps/api/core', () => ({ invoke }))

/** Steps the fake update and the backend stop record, in order. */
const steps: string[] = []

function fakeUpdate() {
  return {
    version: '1.2.3',
    body: '',
    download: vi.fn(async (onEvent: (e: unknown) => void) => {
      onEvent({ event: 'Started', data: { contentLength: 100 } })
      onEvent({ event: 'Progress', data: { chunkLength: 40 } })
      steps.push('downloaded')
    }),
    install: vi.fn(async () => {
      steps.push('installed')
    }),
  }
}

async function render(reason: string, inShell = false) {
  vi.resetModules()
  if (inShell) {
    ;(window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {}
  } else {
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__
  }
  const { i18n } = await import('@/i18n')
  const { default: BackendError } = await import('./BackendError.vue')
  const wrapper = mount(BackendError, { props: { reason }, global: { plugins: [i18n] } })
  await flushPromises()
  return wrapper
}

const restartButton = (wrapper: Awaited<ReturnType<typeof render>>) =>
  wrapper.findAll('button').find((b) => b.text() === 'Restart TypeLab')

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
  steps.length = 0
  invoke.mockImplementation(async (cmd: string) => {
    steps.push(cmd)
  })
})

afterEach(() => {
  delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__
})

describe('BackendError', () => {
  it('shows the reason and an English restart button', async () => {
    const wrapper = await render('port already in use')

    expect(wrapper.text()).toContain('port already in use')
    expect(restartButton(wrapper)).toBeDefined()
  })

  it('relaunches the app when the button is clicked', async () => {
    const wrapper = await render('boom')

    await restartButton(wrapper)!.trigger('click')

    await vi.waitFor(() => expect(relaunch).toHaveBeenCalledOnce())
  })

  it('offers no update in a browser', async () => {
    const wrapper = await render('boom')

    expect(check).not.toHaveBeenCalled()
    expect(wrapper.find('.update').exists()).toBe(false)
  })
})

describe('updating from the error screen', () => {
  it('says checking while the update check runs', async () => {
    check.mockReturnValue(new Promise(() => {}))
    const wrapper = await render('boom', true)

    expect(wrapper.find('.update').text()).toBe('Checking for updates…')
  })

  it('says quietly that there is no update and keeps Restart', async () => {
    check.mockResolvedValue(null)
    const wrapper = await render('boom', true)

    expect(wrapper.find('.update').text()).toBe('No update available.')
    expect(restartButton(wrapper)).toBeDefined()
  })

  it('shows the version and an install button when an update is found', async () => {
    check.mockResolvedValue(fakeUpdate())
    const wrapper = await render('boom', true)

    expect(wrapper.find('.update').text()).toContain('Version 1.2.3 is available.')
    expect(wrapper.get('.update button').text()).toBe('Install update')
  })

  it('installs with progress, stopping the backend after the download', async () => {
    let finishInstall!: () => void
    const update = fakeUpdate()
    update.install.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          steps.push('installed')
          finishInstall = resolve
        }),
    )
    check.mockResolvedValue(update)
    const wrapper = await render('boom', true)

    await wrapper.get('.update button').trigger('click')
    await flushPromises()

    expect(wrapper.get('.update button').text()).toBe('Installing… 40%')
    expect(steps).toEqual(['downloaded', 'stop_backend', 'installed'])
    finishInstall()
    await flushPromises()
    expect(relaunch).toHaveBeenCalledOnce()
  })

  it('disables Restart while an update installs, and re-enables it if the install fails', async () => {
    let failInstall!: (error: Error) => void
    const update = fakeUpdate()
    // A download failure is the one that leaves the backend running.
    update.download.mockImplementation(
      () =>
        new Promise<void>((_, reject) => {
          failInstall = reject
        }),
    )
    check.mockResolvedValue(update)
    const wrapper = await render('boom', true)

    await wrapper.get('.update button').trigger('click')
    await flushPromises()

    expect(restartButton(wrapper)!.attributes('disabled')).toBeDefined()
    failInstall(new Error('nope'))
    await flushPromises()
    expect(restartButton(wrapper)!.attributes('disabled')).toBeUndefined()
  })

  it('shows why an install failed and keeps Restart', async () => {
    const update = fakeUpdate()
    update.download.mockRejectedValue(new Error('signature mismatch'))
    check.mockResolvedValue(update)
    const wrapper = await render('boom', true)

    await wrapper.get('.update button').trigger('click')
    await flushPromises()

    expect(wrapper.find('.update').text()).toBe('Update failed: signature mismatch')
    expect(restartButton(wrapper)).toBeDefined()
  })

  it('tells the app an install started, and that it ended when it fails', async () => {
    const update = fakeUpdate()
    update.download.mockRejectedValue(new Error('signature mismatch'))
    check.mockResolvedValue(update)
    const wrapper = await render('boom', true)

    await wrapper.get('.update button').trigger('click')
    await flushPromises()

    expect(wrapper.emitted('installing')).toEqual([[true], [false]])
  })

  it('shows why the check failed and keeps Restart usable', async () => {
    check.mockRejectedValue(new Error('endpoint unreachable'))
    const wrapper = await render('boom', true)

    expect(wrapper.find('.update').text()).toBe('Update check failed: endpoint unreachable')
    await restartButton(wrapper)!.trigger('click')
    await vi.waitFor(() => expect(relaunch).toHaveBeenCalledOnce())
  })
})

describe('a failed install on the error screen', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('says it is restarting, keeps Restart locked, then relaunches', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] })
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const update = fakeUpdate()
    update.install.mockRejectedValue(new Error('disk full'))
    check.mockResolvedValue(update)
    const wrapper = await render('boom', true)

    await wrapper.get('.update button').trigger('click')
    await flushPromises()

    expect(wrapper.find('.update').text()).toBe('Update failed to install — restarting TypeLab…')
    expect(restartButton(wrapper)!.attributes('disabled')).toBeDefined()
    expect(wrapper.emitted('installing')).toEqual([[true]])
    expect(JSON.parse(localStorage.getItem('typelab.update.failedVersion')!).version).toBe('1.2.3')
    await vi.advanceTimersByTimeAsync(2000)
    expect(relaunch).toHaveBeenCalledOnce()
    error.mockRestore()
  })

  it('shows the stored reason, cut for display, in the notice', async () => {
    const reason = 'z'.repeat(300)
    localStorage.setItem(
      'typelab.update.failedVersion',
      JSON.stringify({ version: '1.2.3', reason, at: 'now' }),
    )
    check.mockResolvedValue(fakeUpdate())
    const wrapper = await render('boom', true)

    expect(wrapper.find('.update').text()).toContain(
      `The last attempt to install v1.2.3 failed: ${'z'.repeat(160)}…`,
    )
    expect(wrapper.find('.update').text()).not.toContain('z'.repeat(161))
    expect(JSON.parse(localStorage.getItem('typelab.update.failedVersion')!).reason).toBe(reason)
  })

  it('asks for a manual reopen and re-enables Restart when the relaunch is rejected', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] })
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    relaunch.mockRejectedValueOnce(new Error('no relaunch'))
    const update = fakeUpdate()
    update.install.mockRejectedValue(new Error('disk full'))
    check.mockResolvedValue(update)
    const wrapper = await render('boom', true)

    await wrapper.get('.update button').trigger('click')
    await flushPromises()
    expect(restartButton(wrapper)!.attributes('disabled')).toBeDefined()
    await vi.advanceTimersByTimeAsync(2000)
    await flushPromises()

    expect(wrapper.find('.update').text()).toBe('Please reopen TypeLab manually.')
    expect(restartButton(wrapper)!.attributes('disabled')).toBeUndefined()
    expect(localStorage.getItem('typelab.update.failedVersion')).not.toBeNull()
    error.mockRestore()
  })

  it('shows the notice and a Retry button for a version that failed before', async () => {
    localStorage.setItem('typelab.update.failedVersion', '1.2.3')
    const update = fakeUpdate()
    check.mockResolvedValue(update)
    const wrapper = await render('boom', true)

    expect(wrapper.find('.update').text()).toContain('The last attempt to install v1.2.3 failed.')
    expect(wrapper.get('.update button').text()).toBe('Retry')
    expect(update.download).not.toHaveBeenCalled()
    expect(update.install).not.toHaveBeenCalled()
  })

  it('offers the normal install for a different version', async () => {
    localStorage.setItem('typelab.update.failedVersion', '1.0.0')
    check.mockResolvedValue(fakeUpdate())
    const wrapper = await render('boom', true)

    expect(wrapper.get('.update button').text()).toBe('Install update')
    expect(localStorage.getItem('typelab.update.failedVersion')).toBeNull()
  })
})

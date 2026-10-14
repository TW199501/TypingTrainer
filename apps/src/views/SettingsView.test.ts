import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { Button } from 'ant-design-vue'

/**
 * The update block of the settings page.
 *
 * `IS_DESKTOP` is fixed when `desktop.ts` loads, so each test re-imports the
 * view inside a window that carries the shell marker. The Tauri plugins are
 * mocked; `desktop.ts` is real.
 */

const relaunch = vi.fn()
const check = vi.fn()
const invoke = vi.fn()
vi.mock('@tauri-apps/plugin-process', () => ({ relaunch }))
vi.mock('@tauri-apps/plugin-updater', () => ({ check }))
vi.mock('@tauri-apps/api/core', () => ({ invoke }))

const KEY = 'typelab.update.failedVersion'

function fakeUpdate() {
  return {
    version: '1.2.3',
    body: '',
    download: vi.fn(async () => {}),
    install: vi.fn(async () => {}),
  }
}

async function render() {
  vi.resetModules()
  ;(window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {}
  setActivePinia(createPinia())
  const { i18n } = await import('@/i18n')
  const { default: SettingsView } = await import('./SettingsView.vue')
  const wrapper = mount(SettingsView, { global: { plugins: [i18n], components: { AButton: Button } } })
  await flushPromises()
  return wrapper
}

const updateRow = (wrapper: Awaited<ReturnType<typeof render>>) => wrapper.get('.update-row')

/** The block's single button; the slot wrapper carries the click handler. */
const updateButton = (wrapper: Awaited<ReturnType<typeof render>>) => updateRow(wrapper).get('button')

async function checkNow(wrapper: Awaited<ReturnType<typeof render>>) {
  await updateRow(wrapper).get('.btn-slot').trigger('click')
  await flushPromises()
}

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
  invoke.mockResolvedValue(undefined)
})

afterEach(() => {
  delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__
  vi.useRealTimers()
})

describe('SettingsView update block', () => {
  it('shows the stored reason, cut for display, for a version that failed before', async () => {
    const reason = 'q'.repeat(300)
    localStorage.setItem(KEY, JSON.stringify({ version: '1.2.3', reason, at: 'now' }))
    check.mockResolvedValue(fakeUpdate())
    const wrapper = await render()

    await checkNow(wrapper)

    expect(updateRow(wrapper).text()).toContain(
      `The last attempt to install v1.2.3 failed: ${'q'.repeat(160)}…`,
    )
    expect(updateRow(wrapper).text()).not.toContain('q'.repeat(161))
    expect(JSON.parse(localStorage.getItem(KEY)!).reason).toBe(reason)
  })

  it('shows the plain notice for a legacy marker with no reason', async () => {
    localStorage.setItem(KEY, '1.2.3')
    check.mockResolvedValue(fakeUpdate())
    const wrapper = await render()

    await checkNow(wrapper)

    expect(updateRow(wrapper).text()).toContain('The last attempt to install v1.2.3 failed.')
    expect(updateButton(wrapper).text()).toBe('Retry')
  })

  it('asks for a manual reopen and leaves the button usable when the relaunch is rejected', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    relaunch.mockRejectedValueOnce(new Error('no relaunch'))
    const update = fakeUpdate()
    update.install.mockRejectedValue(new Error('disk full'))
    check.mockResolvedValue(update)
    const wrapper = await render()
    await checkNow(wrapper)
    vi.useFakeTimers({ toFake: ['setTimeout'] })

    await updateRow(wrapper).get('.btn-slot').trigger('click')
    await flushPromises()
    expect(updateRow(wrapper).text()).toContain('restarting TypeLab')
    expect(updateButton(wrapper).attributes('disabled')).toBeDefined()
    await vi.advanceTimersByTimeAsync(2000)
    await flushPromises()

    expect(updateRow(wrapper).text()).toContain('Please reopen TypeLab manually.')
    expect(updateButton(wrapper).attributes('disabled')).toBeUndefined()
    expect(localStorage.getItem(KEY)).not.toBeNull()
    error.mockRestore()
  })
})

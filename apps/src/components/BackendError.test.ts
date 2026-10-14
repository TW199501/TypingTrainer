import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { i18n } from '@/i18n'
import BackendError from './BackendError.vue'

const relaunch = vi.fn()
vi.mock('@tauri-apps/plugin-process', () => ({ relaunch }))

beforeEach(() => {
  vi.clearAllMocks()
})

function render(reason: string) {
  return mount(BackendError, { props: { reason }, global: { plugins: [i18n] } })
}

describe('BackendError', () => {
  it('shows the reason and an English restart button', () => {
    const wrapper = render('port already in use')

    expect(wrapper.text()).toContain('port already in use')
    expect(wrapper.get('button').text()).toBe('Restart TypeLab')
  })

  it('relaunches the app when the button is clicked', async () => {
    const wrapper = render('boom')

    await wrapper.get('button').trigger('click')

    await vi.waitFor(() => expect(relaunch).toHaveBeenCalledOnce())
  })
})

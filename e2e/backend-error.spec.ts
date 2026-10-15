import { expect, test, type Page } from '@playwright/test'

/**
 * The error screen shown when the bundled API does not start.
 *
 * Restart is disabled while an update installs. A disabled button that still
 * looks and hovers like an active one invites clicks that do nothing; jsdom
 * cannot see that, because it is CSS.
 */

/** A desktop shell whose API never starts and whose update download never finishes. */
async function desktopWithBrokenBackend(page: Page) {
  await page.addInitScript(() => {
    ;(window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {
      transformCallback: () => 1,
      invoke: async (cmd: string) => {
        if (cmd === 'api_base_url') throw 'database is locked'
        if (cmd === 'plugin:updater|check') {
          return { rid: 1, currentVersion: '0.1.14', version: '0.1.15', rawJson: {} }
        }
        if (cmd === 'plugin:updater|download') return new Promise(() => {})
        return undefined
      },
    }
  })
}

test.describe('backend error screen', () => {
  test('restart looks unavailable while an update installs', async ({ page }) => {
    await desktopWithBrokenBackend(page)
    await page.goto('/')
    const restart = page.getByRole('button', { name: 'Restart TypeLab' })
    await expect(restart).toBeEnabled()
    const enabledBackground = await restart.evaluate((n) => getComputedStyle(n).backgroundColor)

    await page.getByRole('button', { name: /install/i }).click()
    await expect(restart).toBeDisabled()
    await restart.hover({ force: true })

    const style = await restart.evaluate((n) => {
      const s = getComputedStyle(n)
      return { cursor: s.cursor, opacity: Number(s.opacity), background: s.backgroundColor }
    })
    expect(style.cursor).not.toBe('pointer')
    expect(style.opacity).toBeLessThan(1)
    expect(style.background, 'a disabled button must not take the hover colour').toBe(enabledBackground)
  })
})

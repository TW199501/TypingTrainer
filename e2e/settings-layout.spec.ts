import { expect, test, type Locator, type Page } from '@playwright/test'

/**
 * Regression cover for the settings page fitting its window.
 *
 * The bug this exists for: `.prefs` was given `flex: 1.1 1 0`, a fixed share of
 * the viewport height. The card was therefore clipped to that share no matter
 * how much room the window actually had, and the five toggles scrolled inside
 * it — one scrollbar in the preferences card, another in the local-data card,
 * a third in the badges grid. Three nested scroll regions on a page that fits.
 *
 * jsdom cannot catch this. Layout, and whether a box overflows, are browser
 * behaviour.
 *
 * Note the locale: with no saved preference `initialLocale()` returns `en`, so
 * every assertion about visible copy here must be against the English string.
 * Asserting the Chinese one passes whatever the page does.
 */

/** True when the element's content is taller than the box drawn for it. */
async function overflows(el: Locator) {
  return el.evaluate((n) => n.scrollHeight > n.clientHeight + 1)
}

async function boxOf(el: Locator) {
  const box = await el.boundingBox()
  expect(box, 'element should be laid out').not.toBeNull()
  return box!
}

/**
 * The updater block is `v-if="IS_DESKTOP"`, which reads a property the Tauri
 * shell injects. Stubbing it renders the block a browser would omit — safe
 * because the Tauri modules are only imported inside the update handlers, which
 * nothing here clicks.
 */
async function pretendDesktop(page: Page) {
  await page.addInitScript(() => {
    ;(window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {}
  })
}

async function openSettings(page: Page, width = 1440, height = 900) {
  await page.setViewportSize({ width, height })
  await page.goto('/#/settings')
  await expect(page.locator('.prefs')).toBeVisible()
}

test.describe('settings layout', () => {
  test.beforeEach(async ({ page }) => {
    await openSettings(page)
  })

  test('the toggles fit without scrolling', async ({ page }) => {
    expect(await overflows(page.locator('.toggles'))).toBe(false)
  })

  test('the toggles are laid out in two columns', async ({ page }) => {
    const rows = page.locator('.toggle-row')
    await expect(rows).toHaveCount(5)

    // Two columns means the first two rows share a top edge; one column means
    // every row sits below the last.
    const first = await boxOf(rows.nth(0))
    const second = await boxOf(rows.nth(1))
    expect(Math.abs(first.y - second.y)).toBeLessThan(2)
  })

  test('the odd last toggle spans both columns', async ({ page }) => {
    const rows = page.locator('.toggle-row')
    const first = await boxOf(rows.nth(0))
    const last = await boxOf(rows.nth(4))
    // Otherwise the final row would be bordered across half the card only.
    expect(last.width).toBeGreaterThan(first.width * 1.5)
  })

  test('the preferences card takes only the height it needs', async ({ page }) => {
    // The point of `flex: 0 1 auto`. Under the old `flex: 1.1 1 0` this card
    // claimed the larger share and the cards below got what was left.
    const prefs = await boxOf(page.locator('.prefs'))
    const bottom = await boxOf(page.locator('.bottom'))
    expect(prefs.height).toBeLessThan(bottom.height)
  })

  test('the redundant preferences heading is gone', async ({ page }) => {
    // The page header already reads Settings / Preferences and achievements.
    await expect(page.locator('.prefs').getByText('Preferences')).toHaveCount(0)
  })

  test('two columns survive a narrow but unstacked window', async ({ page }) => {
    // useGridLayout stacks below 620px of content width; 900 - 264 leaves 636,
    // just inside the two-column band where the columns are at their narrowest.
    await openSettings(page, 900, 900)
    const rows = page.locator('.toggle-row')
    const first = await boxOf(rows.nth(0))
    const second = await boxOf(rows.nth(1))
    expect(Math.abs(first.y - second.y)).toBeLessThan(2)
    expect(await overflows(page.locator('.toggles'))).toBe(false)
  })
})

test.describe('settings layout on desktop', () => {
  test.beforeEach(async ({ page }) => {
    await pretendDesktop(page)
    await openSettings(page)
  })

  test('the installed version replaces the update heading', async ({ page }) => {
    const heading = page.locator('.local .block').last().locator('.card-title')
    // A literal `__APP_VERSION__` surviving the build would fail this too.
    await expect(heading).toHaveText(/^v\d+\.\d+\.\d+$/)
    await expect(page.locator('.local').getByText('Updates', { exact: true })).toHaveCount(0)
  })

  test('the version still names itself to a screen reader', async ({ page }) => {
    const heading = page.locator('.local .block').last().locator('.card-title')
    await expect(heading).toHaveAttribute('aria-label', /^Updates v\d+\.\d+\.\d+$/)
  })

  test('the cards below fit without scrolling', async ({ page }) => {
    // Measured with the updater block present, which is a third of the
    // local-data card and never renders in a plain browser.
    expect(await overflows(page.locator('.local'))).toBe(false)
    expect(await overflows(page.locator('.badges'))).toBe(false)
  })
})

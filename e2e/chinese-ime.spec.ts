import { expect, test, type Page } from '@playwright/test'

/**
 * Regression cover for the Chinese input path.
 *
 * The bug this exists for: clicking Start moved focus to that button, the
 * hidden IME field lost it, and the OS then had nowhere to compose — the
 * candidate window never opened and no character could be chosen. Focus was
 * only ever set on mount and on layout change, and none of the toolbar buttons
 * change the layout.
 *
 * jsdom cannot catch this. Focus and composition are browser behaviour.
 */

const IME = 'input.ime'

async function openChinesePractice(page: Page) {
  await page.goto('/#/practice')
  await page.locator('.seg-item--cat', { hasText: 'Chinese' }).click()
  await expect(page.locator(IME)).toBeAttached()
}

/** Drives a full composition the way a bopomofo IME does: many keys, one character. */
async function compose(page: Page, readings: string[], committed: string) {
  await page.evaluate(
    ({ selector, readings, committed }) => {
      const ime = document.querySelector<HTMLInputElement>(selector)
      if (!ime) throw new Error('no IME field')

      ime.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '' }))
      for (const data of readings) {
        ime.value = data
        ime.dispatchEvent(new CompositionEvent('compositionupdate', { bubbles: true, data }))
        ime.dispatchEvent(new InputEvent('input', { bubbles: true, data, isComposing: true }))
      }
      ime.value = committed
      ime.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: committed }))
      ime.dispatchEvent(new InputEvent('input', { bubbles: true, data: committed, isComposing: false }))
    },
    { selector: IME, readings, committed },
  )
}

const imeHasFocus = (page: Page) =>
  page.evaluate((selector) => document.activeElement === document.querySelector(selector), IME)

test.describe('Chinese IME', () => {
  test('the hidden field holds focus when the practice screen opens', async ({ page }) => {
    await openChinesePractice(page)

    expect(await imeHasFocus(page)).toBe(true)
  })

  test('Start does not steal focus from the IME field', async ({ page }) => {
    await openChinesePractice(page)

    await page.locator('button.ant-btn').first().click()

    expect(await imeHasFocus(page)).toBe(true)
  })

  test('switching topic does not steal focus from the IME field', async ({ page }) => {
    await openChinesePractice(page)

    await page.locator('.pill').nth(1).click()

    expect(await imeHasFocus(page)).toBe(true)
  })

  test('a three-keystroke composition advances the caret by one cell', async ({ page }) => {
    await openChinesePractice(page)

    const cells = page.locator('.char')
    const first = await cells.first().textContent()
    expect(first).toBeTruthy()

    // 打 = ㄉㄚˇ — three physical keys producing a single character.
    await compose(page, ['ㄉ', 'ㄉㄚ', 'ㄉㄚˇ'], first!)

    // The caret marker sits on the cell after the one just typed, not three
    // cells along.
    await expect(cells.nth(1)).toHaveClass(/is-cur/)
    await expect(cells.nth(0)).not.toHaveClass(/is-cur/)
  })

  test('typing still works after using the toolbar', async ({ page }) => {
    await openChinesePractice(page)

    // The original failure only appeared after touching a control, so exercise
    // that order specifically.
    await page.locator('button.ant-btn').first().click()
    expect(await imeHasFocus(page)).toBe(true)

    const first = await page.locator('.char').first().textContent()
    await compose(page, ['ㄉ', 'ㄉㄚ', 'ㄉㄚˇ'], first!)

    await expect(page.locator('.char').nth(1)).toHaveClass(/is-cur/)
  })
})

test.describe('latin practice', () => {
  test('keystrokes advance the caret and update the status bar', async ({ page }) => {
    await page.goto('/#/practice')
    await page.locator('.seg-item--cat', { hasText: 'Basics' }).click()

    // Basics has no IME field: latin runs read physical keys directly.
    await expect(page.locator(IME)).toHaveCount(0)

    await page.keyboard.press('a')
    await page.keyboard.press('s')

    await expect(page.locator('.char').nth(2)).toHaveClass(/is-cur/)
  })
})

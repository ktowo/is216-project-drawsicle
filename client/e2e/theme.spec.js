import { test, expect } from '@playwright/test';
import { logIn } from './helpers.js';

// Light mode and dark mode. Runs in demo mode (see playwright.config.js).
// The site follows the device setting until someone presses the sun/moon button,
// and then it remembers their choice in this browser.

const html = (page) => page.locator('html');
const themeButton = (page) => page.getByRole('button', { name: 'Dark mode' });

// Works out how easy text is to read: 1 is unreadable, 21 is black on white, 4.5 is the usual "good enough"
async function contrastOf(locator) {
  return locator.evaluate((el) => {
    const parse = (c) => c.match(/[\d.]+/g).map(Number);
    const lum = ([r, g, b]) => {
      const f = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const s = getComputedStyle(el);
    const a = lum(parse(s.color));
    const b = lum(parse(s.backgroundColor));
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  });
}

test.describe('Follows the device setting', () => {
  test.describe('device set to light', () => {
    test.use({ colorScheme: 'light' });
    test('starts in light mode', async ({ page }) => {
      await page.goto('/#/');
      await expect(html(page)).toHaveAttribute('data-theme', 'light');
      await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(250, 247, 240)');
    });
  });

  test.describe('device set to dark', () => {
    test.use({ colorScheme: 'dark' });
    test('starts in dark mode', async ({ page }) => {
      await page.goto('/#/');
      await expect(html(page)).toHaveAttribute('data-theme', 'dark');
      await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(20, 18, 25)');
    });
  });
});

test.describe('The sun/moon button', () => {
  test.use({ colorScheme: 'light' });

  test('switches between light and dark, and back again', async ({ page }) => {
    await page.goto('/#/');
    await expect(html(page)).toHaveAttribute('data-theme', 'light');
    await expect(themeButton(page)).toHaveAttribute('aria-pressed', 'false');

    await themeButton(page).click();
    await expect(html(page)).toHaveAttribute('data-theme', 'dark');
    await expect(themeButton(page)).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(20, 18, 25)');

    await themeButton(page).click();
    await expect(html(page)).toHaveAttribute('data-theme', 'light');
  });

  test('remembers the choice after a reload and on other pages', async ({ page }) => {
    await page.goto('/#/');
    await themeButton(page).click();
    await expect(html(page)).toHaveAttribute('data-theme', 'dark');

    await page.reload();
    await expect(html(page)).toHaveAttribute('data-theme', 'dark');

    await page.goto('/#/events');
    await expect(html(page)).toHaveAttribute('data-theme', 'dark');
  });

  test('a saved choice wins over the device setting', async ({ page }) => {
    // Device says light, but the person chose dark earlier
    await page.goto('/#/');
    await themeButton(page).click();
    await page.reload();
    await expect(html(page)).toHaveAttribute('data-theme', 'dark');
  });
});

for (const theme of ['light', 'dark']) {
  test.describe(`Readable in ${theme} mode`, () => {
    test.use({ colorScheme: theme });

    test('the main pink button has easy-to-read text', async ({ page }) => {
      await logIn(page, 'mika');
      await page.goto('/#/dashboard');
      const button = page.locator('.btn-primary').first();
      await expect(button).toBeVisible();
      expect(await contrastOf(button)).toBeGreaterThanOrEqual(4.5);
    });

    test('the page heading is easy to read', async ({ page }) => {
      await page.goto('/#/events');
      const heading = page.getByRole('heading', { level: 1, name: 'Browse events' });
      await expect(heading).toBeVisible();
      // The heading sits on the page background, so compare against that
      const ratio = await heading.evaluate((el) => {
        const parse = (c) => c.match(/[\d.]+/g).map(Number);
        const lum = ([r, g, b]) => {
          const f = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
          return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
        };
        const a = lum(parse(getComputedStyle(el).color));
        const b = lum(parse(getComputedStyle(document.body).backgroundColor));
        return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      });
      expect(ratio).toBeGreaterThanOrEqual(7);
    });
  });

  test.describe(`Phone layout in ${theme} mode`, () => {
    test.use({ colorScheme: theme, viewport: { width: 375, height: 800 } });

    // On a small phone nothing should make the page scroll sideways, and the menu button must stay on screen
    for (const route of ['/', '/events', '/dashboard', '/notifications']) {
      test(`${route} does not scroll sideways`, async ({ page }) => {
        await logIn(page, 'mika');
        await page.goto(`/#${route}`);
        await expect(page.locator('main, #app').first()).toBeVisible();
        await page.waitForTimeout(500);

        const { scrollWidth, clientWidth } = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        }));
        expect(scrollWidth).toBeLessThanOrEqual(clientWidth);

        const menu = page.getByRole('button', { name: /menu/i }).first();
        const box = await menu.boundingBox();
        expect(box).not.toBeNull();
        expect(box.x + box.width).toBeLessThanOrEqual(clientWidth);
      });
    }
  });
}

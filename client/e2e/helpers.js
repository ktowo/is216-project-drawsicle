import { expect } from '@playwright/test';

// Demo mode keeps its "database" and the session in localStorage, and uses hash URLs (/#/...).
export const DEMO_PASSWORD = 'drawsicle123';
const SESSION_KEY = 'drawsicle-mock-session';

export async function logIn(page, key) {
  await page.goto('/#/login');
  await page.getByLabel('Email').fill(`${key}@demo.test`);
  await page.getByLabel('Password', { exact: true }).fill(DEMO_PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).not.toHaveURL(/#\/login/);
}

// Ends the session but keeps the demo data, then logs in as someone else
export async function switchTo(page, key) {
  await page.evaluate((k) => localStorage.removeItem(k), SESSION_KEY);
  // Hash URLs navigate within the page, so reload for the app to notice nobody is logged in
  await page.goto('/#/login');
  await page.reload();
  await logIn(page, key);
}

// Clicks a dialog's confirm button (ConfirmDialog renders role="alertdialog")
export async function confirm(page, name) {
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name }).click();
  await expect(dialog).toBeHidden();
}

// Ticks a chip or checkbox-like button (role="checkbox") only if it isn't ticked already
export async function tick(locator) {
  await expect(locator).toBeVisible();
  if ((await locator.getAttribute('aria-checked')) !== 'true') await locator.click();
  await expect(locator).toHaveAttribute('aria-checked', 'true');
}

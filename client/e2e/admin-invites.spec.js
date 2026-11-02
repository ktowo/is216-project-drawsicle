import { test, expect } from '@playwright/test';
import { logIn } from './helpers.js';

// The Invite codes tab of the site admin page, in demo mode. The demo data has one code, capacity 25.

async function openInvites(page) {
  await logIn(page, 'ada');
  await page.goto('/#/admin?tab=invites');
  await expect(page.getByRole('heading', { name: 'Create invite code' })).toBeVisible();
}

test('typing a capacity changes nothing until it is saved', async ({ page }) => {
  await openInvites(page);
  const usage = page.getByText('0 / 25');
  await expect(usage).toBeVisible();

  await page.getByRole('button', { name: 'Set capacity' }).click();
  await page.getByLabel('New capacity').fill('40');
  await expect(usage).toBeVisible();

  // Closing without saving keeps the old number, and reopening doesn't bring the typed one back
  await page.getByRole('button', { name: 'Set capacity' }).click();
  await expect(usage).toBeVisible();
  await page.getByRole('button', { name: 'Set capacity' }).click();
  await expect(page.getByLabel('New capacity')).toHaveValue('25');

  await page.getByLabel('New capacity').fill('40');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('0 / 40')).toBeVisible();
});

test('says so when the code can not be copied', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('blocked')) } });
    document.execCommand = () => false;
  });
  await openInvites(page);
  await page.getByRole('button', { name: 'Copy' }).click();
  await expect(page.getByText("Couldn't copy the invite code.")).toBeVisible();
  await expect(page.getByText('Invite code copied.')).toHaveCount(0);
});

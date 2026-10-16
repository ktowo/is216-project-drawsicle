import { test, expect } from '@playwright/test';
import { logIn } from './helpers.js';

// The museum: walk in, look at a gift on the wall, sit down and chat.
test('walk the museum, look at a gift, sit and chat', async ({ page }) => {
  await logIn(page, 'mika');
  await page.goto('/#/museum');
  await page.getByRole('link', { name: /Spring Bloom Exchange/ }).click();
  await expect(page.getByRole('application', { name: /Museum room 1 of 1/ })).toBeVisible();

  // Clicking a picture walks up to it and opens a closer look
  await page.getByRole('button', { name: /Look at Biscuit in bloom/ }).click();
  const viewer = page.getByRole('dialog', { name: 'Biscuit in bloom' });
  await expect(viewer).toBeVisible();
  await expect(viewer.getByText(/Artwork \d of \d/)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(viewer).toBeHidden();

  // Chat: a message pops up as a bubble and lands in the room's chat log
  const say = page.getByPlaceholder(/Say something/);
  await say.fill('Hello from the tests');
  await say.press('Enter');
  await expect(page.locator('.bubbles')).toContainText('Hello from the tests');

  // Too quick for the cooldown: the button counts down instead
  await say.fill('/wave');
  await expect(page.locator('.send')).toContainText(/\ds/);

  // /sit sits down where you are
  await page.waitForTimeout(2200);
  await say.fill('/sit');
  await say.press('Enter');
  await expect(page.locator('.avatar.self rect[height="5"]').first()).toBeVisible();

  await page.getByRole('button', { name: /Chat/ }).click();
  await expect(page.getByRole('log', { name: 'Chat in this room' })).toContainText('Hello from the tests');

  // The same artworks as a plain list, for anyone who'd rather not walk
  await page.getByRole('button', { name: 'See them as a list' }).click();
  await expect(page.getByText('Biscuit in bloom')).toBeVisible();
});

import { test, expect } from '@playwright/test';
import { logIn, switchTo } from './helpers.js';

// An organiser finds an artist on Discover and invites them to an open event; the artist is told.
test('an organiser invites an artist from Discover', async ({ page }) => {
  // Mika organises events that are open for sign-ups, including Winter Secret Santa 2026
  await logIn(page, 'mika');
  await page.goto('/#/discover?q=pip');
  await expect(page.getByText(/Looking for artists for/)).toBeVisible();

  const card = page.getByRole('article').filter({ hasText: '@pip' });
  await card.getByRole('button', { name: /Invite Pip to an event/ }).click();

  const dialog = page.getByRole('dialog', { name: /Invite Pip/ });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Which event?').selectOption({ label: 'Winter Secret Santa 2026' });
  await dialog.getByLabel(/A message/).fill('Your pastel style would fit in here');
  await dialog.getByRole('button', { name: 'Send invite' }).click();

  // The window closes. Mika has other open events, so the button stays for those
  await expect(dialog).toBeHidden();

  // Asking again for the same event says so, and the Send button is switched off
  await card.getByRole('button', { name: /Invite Pip to an event/ }).click();
  await dialog.getByLabel('Which event?').selectOption({ label: 'Winter Secret Santa 2026' });
  await expect(dialog.getByText(/already invited Pip to this event/)).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Send invite' })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();

  // Pip got a notification
  await switchTo(page, 'pip');
  await page.goto('/#/notifications');
  await expect(page.getByText(/invited you to Winter Secret Santa 2026/)).toBeVisible();
  await expect(page.getByText('Your pastel style would fit in here')).toBeVisible();
});

test('people with no open event of their own do not see Invite buttons', async ({ page }) => {
  await logIn(page, 'pip');
  await page.goto('/#/discover?q=mika');
  await expect(page.getByRole('article').filter({ hasText: '@mika' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Invite .* to an event/ })).toHaveCount(0);
  await expect(page.getByText(/Looking for artists for/)).toHaveCount(0);
});

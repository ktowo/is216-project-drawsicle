import { test, expect } from '@playwright/test';
import { logIn, switchTo, confirm, tick } from './helpers.js';

// A whole exchange in a real browser: someone signs up, the organiser matches everyone and
// publishes, the gift goes in, and the reveal shows it.
test('from sign-up to the reveal', async ({ page }) => {
  // Kit signs up for Winter Secret Santa (Mika organises it; five people are already in)
  await logIn(page, 'kit');
  await page.goto('/#/events');
  await page.getByRole('link', { name: 'Winter Secret Santa 2026' }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: 'Winter Secret Santa 2026' })).toBeVisible();
  const eventUrl = page.url();
  await page.getByRole('link', { name: 'Sign up', exact: true }).first().click();

  await page.getByLabel(/Your username on/).fill('kit#0001');
  await tick(page.getByRole('group', { name: /What can you make/ }).getByRole('checkbox', { name: 'Art' }));
  await tick(page.getByRole('group', { name: /What would you like to receive/ }).getByRole('checkbox', { name: 'Art' }));
  await page.getByRole('button', { name: /Next: Characters/ }).click();
  await tick(page.getByRole('checkbox', { name: /Fennec/ }));
  await page.getByRole('button', { name: /Next: Preferences/ }).click();
  await page.getByRole('button', { name: /Next: Review and send/ }).click();
  await page.getByRole('button', { name: 'Send sign-up' }).click();
  await expect(page.getByText(/signed up|Sign-up sent|You're in/i).first()).toBeVisible();

  // Mika closes sign-ups, generates matches and publishes them
  await switchTo(page, 'mika');
  await page.goto(eventUrl.replace(/\/?$/, '/manage'));
  await page.getByRole('button', { name: /Close sign-ups now/ }).click();
  await confirm(page, 'Close sign-ups');
  await page.getByRole('button', { name: /Go to matching/ }).click();
  await page.getByRole('button', { name: /^Generate matches$/ }).click();
  await expect(page.getByText(/Gift loops/)).toBeVisible();
  await page.getByRole('button', { name: /Publish matches/ }).click();
  await confirm(page, 'Publish & start event');
  await expect(page.getByText('Published matches')).toBeVisible();

  // Kit sees their match and sends a gift (a link, so no upload is needed)
  await switchTo(page, 'kit');
  await page.goto(eventUrl);
  await page.getByRole('link', { name: 'Submit your gift' }).first().click();
  await page.getByRole('button', { name: 'Add a link' }).click();
  await page.getByPlaceholder('https://').first().fill('https://example.com/kit-winter-gift');
  await page.getByLabel('Title').fill('Snowy lantern');
  await page.getByRole('button', { name: 'Send my gift' }).click();
  // Saved: the page now offers to change or delete it
  await expect(page.getByRole('button', { name: 'Save changes' })).toBeVisible();

  // Mika reveals the gifts
  await switchTo(page, 'mika');
  await page.goto(eventUrl.replace(/\/?$/, '/manage'));
  await page.getByRole('button', { name: /Complete event & reveal gifts/ }).click();
  await confirm(page, 'Complete & reveal');

  // The reveal: Kit's gift is there, wrapped until someone opens it
  await page.goto(eventUrl.replace(/\/?$/, '/results'));
  await expect(page.getByRole('heading', { name: 'Every gift' })).toBeVisible();
  await page.getByRole('button', { name: 'Unwrap them all' }).click();
  await expect(page.getByText('Snowy lantern')).toBeVisible();
});

import { test, expect } from '@playwright/test';
import { logIn, tick } from './helpers.js';

// The 4-step sign-up form: About you -> Characters -> Preferences -> Review and send.
// Runs in demo mode (see playwright.config.js). Kit signs up for "Winter Secret Santa 2026",
// which Kit has not joined yet in the demo data.

async function openSignUp(page) {
  await logIn(page, 'kit');
  await page.goto('/#/events');
  await page.getByRole('link', { name: 'Winter Secret Santa 2026' }).first().click();
  await page.getByRole('link', { name: 'Sign up', exact: true }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: 'Sign up' })).toBeVisible();
}

const typeGroup = (page, name) => page.getByRole('group', { name });

test.describe('Sign-up form', () => {
  test('shows the four steps and starts on "About you"', async ({ page }) => {
    await openSignUp(page);

    const steps = page.getByRole('navigation', { name: 'Sign-up steps' });
    for (const title of ['About you', 'Characters', 'Preferences', 'Review and send']) {
      await expect(steps.getByRole('button', { name: new RegExp(title) })).toBeVisible();
    }
    await expect(steps.getByRole('button', { name: /About you/ })).toHaveAttribute('aria-current', 'step');

    // Steps you have not reached yet cannot be clicked
    await expect(steps.getByRole('button', { name: /Review and send/ })).toBeDisabled();
  });

  test('will not move on until step 1 is filled in', async ({ page }) => {
    await openSignUp(page);

    // Some answers may be pre-filled from the person's saved defaults, so empty the required one
    await page.getByLabel(/Your username on/).fill('');
    await page.getByRole('button', { name: /Next: Characters/ }).click();

    // Still on step 1, with the problems pointed out
    await expect(page.getByRole('heading', { name: 'About you' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Sign-up steps' }).getByRole('button', { name: /About you/ })).toHaveAttribute(
      'aria-current',
      'step'
    );
    await expect(page.getByRole('heading', { name: 'Characters to offer' })).toBeHidden();
    await expect(page.getByLabel(/Your username on/)).toHaveAttribute('aria-invalid', 'true');
  });

  test('the review step shows the answers and lets you go back to fix one', async ({ page }) => {
    await openSignUp(page);

    await page.getByLabel(/Your username on/).fill('kit#0001');
    await tick(typeGroup(page, /What can you make/).getByRole('checkbox', { name: 'Art' }));
    await tick(typeGroup(page, /What would you like to receive/).getByRole('checkbox', { name: 'Art' }));
    await page.getByRole('button', { name: /Next: Characters/ }).click();
    await tick(page.getByRole('checkbox', { name: /Fennec/ }));
    await page.getByRole('button', { name: /Next: Preferences/ }).click();
    await page.getByLabel('What would you love to get?').fill('Cosy winter scenes');
    await page.getByRole('button', { name: /Next: Review and send/ }).click();

    // Everything typed so far is on the summary
    await expect(page.getByRole('heading', { name: 'Review and send' })).toBeVisible();
    const review = page.locator('.review');
    await expect(review.getByText('kit#0001')).toBeVisible();
    await expect(review.getByText('Fennec')).toBeVisible();
    await expect(review.getByText('Cosy winter scenes')).toBeVisible();

    // "Edit" jumps back to that step, and Next brings you straight forward again
    await page.getByRole('button', { name: /Edit\s*about you/ }).click();
    await expect(page.getByLabel(/Your username on/)).toHaveValue('kit#0001');
    await page.getByLabel(/Your username on/).fill('kit#9999');
    for (const next of [/Next: Characters/, /Next: Preferences/, /Next: Review and send/]) {
      await page.getByRole('button', { name: next }).click();
    }
    await expect(page.locator('.review').getByText('kit#9999')).toBeVisible();
  });

  test('keeps a draft in this browser and offers to restore it', async ({ page }) => {
    await openSignUp(page);
    const signUpUrl = page.url();

    await page.getByLabel(/Your username on/).fill('kit#draft');
    // The draft is saved a moment after typing stops
    await page.waitForTimeout(1000);

    // Leave and come back (a full reload, like closing the tab by accident)
    await page.goto('/#/events');
    await page.goto(signUpUrl);
    await page.reload();

    const banner = page.getByRole('status').filter({ hasText: 'You started filling this in earlier' });
    await expect(banner).toBeVisible();
    await banner.getByRole('button', { name: 'Restore my draft' }).click();
    await expect(page.getByLabel(/Your username on/)).toHaveValue('kit#draft');
  });

  test('"Start fresh" throws the draft away', async ({ page }) => {
    await openSignUp(page);
    const signUpUrl = page.url();

    await page.getByLabel(/Your username on/).fill('kit#old');
    await page.waitForTimeout(1000);
    await page.goto('/#/events');
    await page.goto(signUpUrl);
    await page.reload();

    await page.getByRole('button', { name: 'Start fresh' }).click();
    await expect(page.getByText('You started filling this in earlier')).toBeHidden();
    await expect(page.getByLabel(/Your username on/)).not.toHaveValue('kit#old');
  });
});

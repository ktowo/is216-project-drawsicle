import { test, expect } from '@playwright/test';

// The "Enter your invite code" page, in demo mode. The demo data has one code, DRAWSCICLE-DEMO.

test('a wrong code is explained, a good one opens sign-up with the code filled in', async ({ page }) => {
  await page.goto('/#/login');
  await page.getByRole('link', { name: 'Enter it here' }).click();
  await expect(page.getByRole('heading', { name: 'Enter your invite code' })).toBeVisible();

  // Nothing typed
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('Enter the invite code you were given.')).toBeVisible();

  // A code that doesn't exist: the reason shows under the field and we stay here
  await page.getByLabel('Invite code').fill('NOT-A-CODE');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('That invite code is not valid.')).toBeVisible();
  await expect(page).toHaveURL(/#\/invite/);

  // A working code (any case): sign-up opens with it already in the box
  await page.getByLabel('Invite code').fill('drawscicle-demo');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible();
  await expect(page.getByLabel('Invite code')).toHaveValue('DRAWSCICLE-DEMO');
});

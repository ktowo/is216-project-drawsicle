import { test, expect } from '@playwright/test';
import { logIn, switchTo } from './helpers.js';

// The event's id from the address bar (/#/events/<id>...)
const eventIdOf = (page) => page.url().match(/events\/([^/?#]+)/)[1];

// Organiser ratings in a real browser: after the reveal an artist rates the organiser,
// the average moves on the organiser's profile, and the organiser gets told.
test('an artist rates the organiser and the score shows on their profile', async ({ page }) => {
  // Kit took part in Spring Bloom Exchange (Juniper organised it) and hasn't rated yet
  await logIn(page, 'kit');
  await page.goto('/#/events?status=all&q=Spring%20Bloom');
  await page.getByRole('link', { name: 'Spring Bloom Exchange' }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: 'Spring Bloom Exchange' })).toBeVisible();
  // The event page shows the organiser's score from the demo ratings
  await expect(page.getByText(/rating from artists/)).toBeVisible();
  await expect(page.getByText('(4 ratings)').first()).toBeVisible();

  await page.goto(`/#/events/${eventIdOf(page)}/results`);
  const box = page.getByRole('region', { name: /How was/ });
  await expect(box).toBeVisible();

  // Pick nothing and send: asks for stars first
  await box.getByRole('button', { name: 'Send rating' }).click();
  await expect(box.getByRole('alert')).toHaveText('Pick 1 to 5 stars first.');

  // 3 stars with a comment
  await box.getByRole('radio', { name: /^3 stars/ }).click();
  await expect(box.getByRole('radio', { name: /^3 stars/ })).toHaveAttribute('aria-checked', 'true');
  await box.locator('textarea').fill('Friendly, a bit slow with updates');
  await box.getByRole('button', { name: 'Send rating' }).click();
  await expect(box.getByText('You gave 3 stars')).toBeVisible();
  await expect(box.getByText('Friendly, a bit slow with updates')).toBeVisible();
  // (5 + 4 + 5 + 5 + 3) / 5 = 4.4
  await expect(box.getByText('4.4')).toBeVisible();
  await expect(box.getByText('(5 ratings)')).toBeVisible();

  // Changing the rating keeps it at five ratings
  await box.getByRole('button', { name: 'Edit' }).click();
  await box.getByRole('radio', { name: /^5 stars/ }).click();
  await box.getByRole('button', { name: 'Save' }).click();
  await expect(box.getByText('You gave 5 stars')).toBeVisible();
  await expect(box.getByText('(5 ratings)')).toBeVisible();

  // The organiser's profile shows the average and the anonymous comment
  await page.goto('/#/users/juniper');
  await expect(page.getByText('Rated by artists who joined their events')).toBeVisible();
  await expect(page.getByText('(5 ratings)').first()).toBeVisible();
  await expect(page.getByText('Friendly, a bit slow with updates')).toBeVisible();
  await expect(page.getByText(/Great communication/)).toBeVisible();
  // The comments never say who wrote them
  await expect(page.getByText(/An artist from Spring Bloom Exchange/).first()).toBeVisible();

  // Juniper was told about the rating, without a name
  await switchTo(page, 'juniper');
  await page.goto('/#/notifications');
  await expect(page.getByText(/You got a 3-star rating for Spring Bloom Exchange/)).toBeVisible();
});

test('the organiser and people who did not take part see no rating box', async ({ page }) => {
  await logIn(page, 'juniper');
  await page.goto('/#/events?status=all&q=Spring%20Bloom');
  await page.getByRole('link', { name: 'Spring Bloom Exchange' }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: 'Spring Bloom Exchange' })).toBeVisible();
  await page.goto(`/#/events/${eventIdOf(page)}/results`);
  await expect(page.getByRole('heading', { name: 'Every gift' })).toBeVisible();
  await expect(page.getByRole('region', { name: /How was/ })).toHaveCount(0);
});

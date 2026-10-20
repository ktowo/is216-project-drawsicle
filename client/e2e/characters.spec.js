import { test, expect } from '@playwright/test';
import { logIn } from './helpers.js';

// Character library: the things a person does with their characters.
// Runs in demo mode (see playwright.config.js), so every test starts with fresh demo data.
// Mika is a demo account that already has a library of characters.

const cards = (page) => page.getByRole('list', { name: 'Characters' }).getByRole('article');
const cardNames = (page) => cards(page).getByRole('heading', { level: 3 }).allInnerTexts();

test.describe('Character library', () => {
  test.beforeEach(async ({ page }) => {
    await logIn(page, 'mika');
    await page.goto('/#/characters');
    await expect(page.getByRole('heading', { level: 1, name: 'Character library' })).toBeVisible();
    await expect(cards(page).first()).toBeVisible();
  });

  test('filters by tag, then clears the filter', async ({ page }) => {
    const total = await cards(page).count();

    const tagGroup = page.getByRole('group', { name: 'Filter by tag' });
    await tagGroup.getByRole('button', { name: /^pastel/ }).click();

    // Fewer cards, every one of them has the tag, and a summary line says what is filtered
    await expect(page.getByText(/match(es)? the tag “pastel”/)).toBeVisible();
    const filtered = await cards(page).count();
    expect(filtered).toBeGreaterThan(0);
    expect(filtered).toBeLessThan(total);
    for (const card of await cards(page).all()) {
      await expect(card.getByRole('list', { name: 'Tags' }).getByText('pastel', { exact: true })).toBeVisible();
    }

    // Pressing the same chip again takes the filter off
    await tagGroup.getByRole('button', { name: /^pastel/ }).click();
    await expect(cards(page)).toHaveCount(total);
  });

  test('searching shows a friendly message when nothing matches', async ({ page }) => {
    await page.getByLabel('Search characters').fill('zzzz-no-such-character');
    await expect(page.getByRole('heading', { name: 'No matches' })).toBeVisible();

    await page.getByRole('button', { name: 'Clear filters' }).click();
    await expect(cards(page).first()).toBeVisible();
  });

  test('sorts by name (favourites stay on top) and remembers the choice', async ({ page }) => {
    await page.getByLabel('Sort characters').selectOption('name');

    // Favourites always come first, so check A–Z inside the non-favourite group
    const rest = [];
    for (const card of await cards(page).all()) {
      const isFavourite = (await card.getByLabel('Favourite').count()) > 0;
      if (!isFavourite) rest.push(await card.getByRole('heading', { level: 3 }).innerText());
    }
    expect(rest.length).toBeGreaterThan(1);
    expect(rest).toEqual([...rest].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })));

    // The choice is kept after a reload
    await page.reload();
    await expect(page.getByLabel('Sort characters')).toHaveValue('name');
  });

  test('switches between full and compact cards', async ({ page }) => {
    const full = page.getByRole('button', { name: 'Full cards' });
    const compact = page.getByRole('button', { name: 'Compact cards' });
    const grid = page.getByRole('list', { name: 'Characters' });

    await expect(full).toHaveAttribute('aria-pressed', 'true');
    await expect(grid).not.toHaveClass(/compact/);

    await compact.click();
    await expect(compact).toHaveAttribute('aria-pressed', 'true');
    await expect(grid).toHaveClass(/compact/);
  });

  test('duplicates a character into a copy ready to edit', async ({ page }) => {
    const before = await cards(page).count();
    const [firstName] = await cardNames(page);

    await page.getByRole('button', { name: `Duplicate ${firstName}` }).click();

    // Lands on the edit page of the copy, with "(copy)" added to the name
    await expect(page).toHaveURL(/#\/characters\/[^/]+\/edit/);
    await expect(page.getByLabel('Name')).toHaveValue(`${firstName} (copy)`);

    // Back in the library there is one more character
    await page.goto('/#/characters');
    await expect(cards(page)).toHaveCount(before + 1);
  });

  test('creating a character shows a live preview and then saves it', async ({ page }) => {
    await page.getByRole('link', { name: 'New character' }).first().click();
    await expect(page.getByRole('heading', { level: 1, name: 'New character' })).toBeVisible();

    const preview = page.getByRole('complementary', { name: /Preview and events/ });
    await expect(preview.getByText('Your character')).toBeVisible();

    // Typing updates the preview straight away, without saving
    await page.getByLabel('Name').fill('Test Tulip');
    await page.getByLabel('Species', { exact: true }).fill('moth');
    await expect(preview.getByText('Test Tulip')).toBeVisible();
    await expect(preview.getByText(/moth/)).toBeVisible();

    await page.getByRole('button', { name: 'Save character' }).click();

    // Wait until it has really been saved (we leave the "new" page), then look in the library
    await expect(page).not.toHaveURL(/#\/characters\/new/);
    await page.goto('/#/characters');
    await expect(cards(page).getByRole('heading', { level: 3, name: 'Test Tulip' })).toBeVisible();
  });

  test('a name is required', async ({ page }) => {
    await page.getByRole('link', { name: 'New character' }).first().click();
    await page.getByRole('button', { name: 'Save character' }).click();

    // Still on the form, nothing was saved
    await expect(page).toHaveURL(/#\/characters\/new/);
    await expect(page.getByRole('heading', { level: 1, name: 'New character' })).toBeVisible();
  });

  test('a character used in an event lists it under "Offered in"', async ({ page }) => {
    // Cards for characters that were offered in an event say "In use in N event(s)"
    const inUse = cards(page).filter({ hasText: /In use in \d+ event/ }).first();
    await expect(inUse).toBeVisible();

    await inUse.getByRole('link').first().click();
    await expect(page.getByRole('heading', { name: /Offered in \d+ events?/ })).toBeVisible();
  });
});

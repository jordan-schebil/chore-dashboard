import { test, expect } from '@playwright/test';

test('calendar and manage views show default chores', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Chore Dashboard' })).toBeVisible();
  await expect(page.getByText('Calendar')).toBeVisible();

  await page.getByRole('button', { name: 'Manage' }).click();
  await expect(page.getByRole('heading', { name: 'All Chores' })).toBeVisible();

  const search = page.getByPlaceholder('Search...');
  await search.fill('Make bed');
  await expect(page.getByText('Make bed')).toBeVisible();
});

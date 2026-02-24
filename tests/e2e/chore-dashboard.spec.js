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

test('manage tab supports create, edit, and delete chore flow', async ({ page }) => {
  const unique = Date.now();
  const choreName = `E2E Chore ${unique}`;
  const updatedChoreName = `E2E Chore Updated ${unique}`;

  await page.goto('/');
  await page.getByRole('button', { name: 'Manage' }).click();
  await expect(page.getByRole('heading', { name: 'All Chores' })).toBeVisible();

  // Create
  const createResponsePromise = page.waitForResponse(
    (resp) => resp.request().method() === 'POST' && new URL(resp.url()).pathname === '/chores'
  );
  await page.getByRole('button', { name: /^Add$/ }).first().click();
  const addModal = page.locator('div.fixed.inset-0').filter({
    has: page.getByRole('heading', { name: 'Add Chore' })
  });
  await expect(addModal.getByRole('heading', { name: 'Add Chore' })).toBeVisible();
  await addModal.getByPlaceholder('Chore name').fill(choreName);
  await addModal.locator('select').first().selectOption('PM');
  await addModal.locator('input[type="number"]').first().fill('17');
  await addModal.getByRole('button', { name: 'Add' }).click();
  const createResponse = await createResponsePromise;
  const createResponseText = await createResponse.text();
  expect(
    createResponse.ok(),
    `Expected chore create request to succeed, got ${createResponse.status()} ${createResponse.url()} body=${createResponse.request().postData() ?? '<none>'} response=${createResponseText}`
  ).toBeTruthy();
  await expect(page.getByRole('heading', { name: 'Add Chore' })).toHaveCount(0);
  await expect(page.getByText('Saved')).toBeVisible();

  const search = page.getByPlaceholder('Search...');
  await search.fill(choreName);

  const createdRow = page
    .locator('div.flex.items-center.gap-3.p-3.bg-white')
    .filter({ hasText: choreName })
    .first();
  await expect(createdRow).toBeVisible();
  await expect(createdRow).toContainText('PM');
  await expect(createdRow).toContainText('17m');

  // Edit
  await createdRow.locator('button').first().click();
  const editModal = page.locator('div.fixed.inset-0').filter({
    has: page.getByRole('heading', { name: 'Edit Chore' })
  });
  await expect(editModal.getByRole('heading', { name: 'Edit Chore' })).toBeVisible();
  await editModal.locator('input[type="text"]').first().fill(updatedChoreName);
  await editModal.locator('input[type="number"]').first().fill('23');
  await editModal.locator('select').first().selectOption('AM');
  const updateResponsePromise = page.waitForResponse(
    (resp) =>
      resp.request().method() === 'PUT' &&
      /\/chores\/[^/]+$/.test(new URL(resp.url()).pathname) &&
      !resp.url().endsWith('/chores/global-order')
  );
  await editModal.getByRole('button', { name: 'Save' }).click();
  const updateResponse = await updateResponsePromise;
  const updateResponseText = await updateResponse.text();
  const updateRequest = updateResponse.request();
  expect(
    updateResponse.ok(),
    `Expected chore update request to succeed, got ${updateResponse.status()} ${updateResponse.url()} body=${updateRequest.postData() ?? '<none>'} response=${updateResponseText}`
  ).toBeTruthy();
  await expect(page.getByRole('heading', { name: 'Edit Chore' })).toHaveCount(0);
  await expect(page.getByText('Saved')).toBeVisible();

  await search.fill(updatedChoreName);
  const updatedRow = page
    .locator('div.flex.items-center.gap-3.p-3.bg-white')
    .filter({ hasText: updatedChoreName })
    .first();
  await expect(updatedRow).toBeVisible();
  await expect(updatedRow).toContainText('AM');
  await expect(updatedRow).toContainText('23m');

  // Delete
  const deleteResponsePromise = page.waitForResponse(
    (resp) =>
      resp.request().method() === 'DELETE' &&
      /\/chores\/[^/]+$/.test(new URL(resp.url()).pathname)
  );
  await updatedRow.locator('button').nth(1).click();
  const deleteResponse = await deleteResponsePromise;
  const deleteResponseText = await deleteResponse.text();
  expect(
    deleteResponse.ok(),
    `Expected chore delete request to succeed, got ${deleteResponse.status()} ${deleteResponse.url()} response=${deleteResponseText}`
  ).toBeTruthy();

  await expect(page.getByText('Saved')).toBeVisible();
  await expect(
    page.locator('div.flex.items-center.gap-3.p-3.bg-white').filter({ hasText: updatedChoreName })
  ).toHaveCount(0);
});

test('manage tab reorder mode updates global order and persists after reload', async ({ page, request }) => {
  const resetRes = await request.post('http://localhost:8000/reset');
  expect(resetRes.ok()).toBeTruthy();

  await page.goto('/');
  await page.getByRole('button', { name: 'Manage' }).click();
  await expect(page.getByRole('heading', { name: 'All Chores' })).toBeVisible();

  await page.getByRole('button', { name: 'Reorder' }).click();
  await expect(page.getByText('Drag chores to set your global default order.')).toBeVisible();

  const reorderRows = page.getByRole('listitem');
  await expect(reorderRows.nth(3)).toBeVisible();

  const firstRow = reorderRows.nth(0);
  const secondRow = reorderRows.nth(1);
  const firstNameBefore = (await firstRow.locator('div.text-sm.text-gray-800.truncate').innerText()).trim();
  const secondNameBefore = (await secondRow.locator('div.text-sm.text-gray-800.truncate').innerText()).trim();

  const reorderResponsePromise = page.waitForResponse(
    (resp) =>
      resp.request().method() === 'PUT' && new URL(resp.url()).pathname === '/chores/global-order'
  );
  await secondRow.dragTo(firstRow);
  const reorderResponse = await reorderResponsePromise;
  const reorderResponseText = await reorderResponse.text();
  expect(
    reorderResponse.ok(),
    `Expected global reorder request to succeed, got ${reorderResponse.status()} ${reorderResponse.url()} body=${reorderResponse.request().postData() ?? '<none>'} response=${reorderResponseText}`
  ).toBeTruthy();

  await expect(page.getByText('Saved')).toBeVisible();

  const firstNameAfter = (await reorderRows.nth(0).locator('div.text-sm.text-gray-800.truncate').innerText()).trim();
  expect(firstNameAfter).toBe(secondNameBefore);

  await page.reload();
  await page.getByRole('button', { name: 'Manage' }).click();
  await page.getByRole('button', { name: 'Reorder' }).click();
  await expect(page.getByText('Drag chores to set your global default order.')).toBeVisible();
  await expect(page.getByRole('listitem').nth(0)).toBeVisible();

  const firstNameAfterReload = (
    await page.getByRole('listitem').nth(0).locator('div.text-sm.text-gray-800.truncate').innerText()
  ).trim();
  expect(firstNameAfterReload).toBe(secondNameBefore);
  expect(firstNameAfterReload).not.toBe(firstNameBefore);
});

test('calendar completion toggle persists after reload', async ({ page, request }) => {
  const resetRes = await request.post('http://localhost:8000/reset');
  expect(resetRes.ok()).toBeTruthy();

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Chore Dashboard' })).toBeVisible();

  const dayPanel = page
    .locator('div.bg-white.rounded-xl.shadow-sm.p-6')
    .filter({ has: page.getByRole('button', { name: 'Reset Order' }) });

  const makeBedRow = dayPanel.locator('li').filter({ hasText: 'Make bed' }).first();
  await expect(makeBedRow).toBeVisible();

  const makeBedToggle = makeBedRow.locator('button[aria-pressed]').first();
  await expect(makeBedToggle).toHaveAttribute('aria-pressed', 'false');

  const toggleResponsePromise = page.waitForResponse(
    (resp) => resp.request().method() === 'POST' && new URL(resp.url()).pathname === '/completions/toggle'
  );
  await makeBedToggle.click();
  const toggleResponse = await toggleResponsePromise;
  const toggleResponseText = await toggleResponse.text();
  expect(
    toggleResponse.ok(),
    `Expected completion toggle request to succeed, got ${toggleResponse.status()} ${toggleResponse.url()} body=${toggleResponse.request().postData() ?? '<none>'} response=${toggleResponseText}`
  ).toBeTruthy();

  await expect(makeBedToggle).toHaveAttribute('aria-pressed', 'true');

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Chore Dashboard' })).toBeVisible();

  const dayPanelAfterReload = page
    .locator('div.bg-white.rounded-xl.shadow-sm.p-6')
    .filter({ has: page.getByRole('button', { name: 'Reset Order' }) });
  const makeBedRowAfterReload = dayPanelAfterReload.locator('li').filter({ hasText: 'Make bed' }).first();
  await expect(makeBedRowAfterReload).toBeVisible();
  const makeBedToggleAfterReload = makeBedRowAfterReload.locator('button[aria-pressed]').first();
  await expect(makeBedToggleAfterReload).toHaveAttribute('aria-pressed', 'true');
});

test('manage tab supports room create/edit/delete and updates chore room labels', async ({ page, request }) => {
  const unique = Date.now();
  const roomName = `Room ${unique}`;
  const renamedRoom = `Room Renamed ${unique}`;
  const choreName = `Room Linked Chore ${unique}`;

  const resetRes = await request.post('http://localhost:8000/reset');
  expect(resetRes.ok()).toBeTruthy();

  await page.goto('/');
  await page.getByRole('button', { name: 'Manage' }).click();
  await expect(page.getByRole('heading', { name: 'All Chores' })).toBeVisible();

  const roomsPanel = page
    .locator('div.bg-white.rounded-xl.shadow-sm.p-6')
    .filter({ has: page.getByRole('heading', { name: 'Rooms' }) });

  const roomInput = roomsPanel.getByPlaceholder('Add a room (e.g., Kitchen)');
  const addRoomResponsePromise = page.waitForResponse(
    (resp) => resp.request().method() === 'POST' && new URL(resp.url()).pathname === '/rooms'
  );
  await roomInput.fill(roomName);
  await roomsPanel.getByRole('button', { name: 'Add Room' }).click();
  const addRoomResponse = await addRoomResponsePromise;
  const addRoomResponseText = await addRoomResponse.text();
  expect(
    addRoomResponse.ok(),
    `Expected room create request to succeed, got ${addRoomResponse.status()} ${addRoomResponse.url()} body=${addRoomResponse.request().postData() ?? '<none>'} response=${addRoomResponseText}`
  ).toBeTruthy();

  const roomChip = roomsPanel
    .locator('div.flex.items-center.gap-2.px-3.py-1\\.5.bg-gray-100.rounded-full.text-sm.text-gray-700')
    .filter({ hasText: roomName })
    .first();
  await expect(roomChip).toBeVisible();

  // Create a chore linked to the room
  const choresPanel = page
    .locator('div.bg-white.rounded-xl.shadow-sm.p-6')
    .filter({ has: page.getByRole('heading', { name: 'All Chores' }) });
  const addChoreResponsePromise = page.waitForResponse(
    (resp) => resp.request().method() === 'POST' && new URL(resp.url()).pathname === '/chores'
  );
  await choresPanel.getByRole('button', { name: /^Add$/ }).first().click();

  const addModal = page.locator('div.fixed.inset-0').filter({
    has: page.getByRole('heading', { name: 'Add Chore' })
  });
  await expect(addModal.getByRole('heading', { name: 'Add Chore' })).toBeVisible();
  await addModal.getByPlaceholder('Chore name').fill(choreName);
  await addModal.getByLabel(roomName).check();
  await addModal.getByRole('button', { name: 'Add' }).click();

  const addChoreResponse = await addChoreResponsePromise;
  const addChoreResponseText = await addChoreResponse.text();
  expect(
    addChoreResponse.ok(),
    `Expected chore create request to succeed, got ${addChoreResponse.status()} ${addChoreResponse.url()} body=${addChoreResponse.request().postData() ?? '<none>'} response=${addChoreResponseText}`
  ).toBeTruthy();
  await expect(page.getByText('Saved')).toBeVisible();

  const search = choresPanel.getByPlaceholder('Search...');
  await search.fill(choreName);
  const choreRow = page
    .locator('div.flex.items-center.gap-3.p-3.bg-white')
    .filter({ hasText: choreName })
    .first();
  await expect(choreRow).toBeVisible();
  await expect(choreRow).toContainText(`Rooms: ${roomName}`);

  // Edit room name and verify chore label updates
  await roomChip.getByRole('button', { name: 'Edit' }).click();
  const inlineRoomEditInput = roomsPanel.locator('input[type="text"]:not([placeholder])').first();
  await expect(inlineRoomEditInput).toBeVisible();
  await inlineRoomEditInput.fill(renamedRoom);
  const updateRoomResponsePromise = page.waitForResponse(
    (resp) =>
      resp.request().method() === 'PUT' &&
      /\/rooms\/[^/]+$/.test(new URL(resp.url()).pathname)
  );
  await roomsPanel.getByRole('button', { name: 'Save' }).click();
  const updateRoomResponse = await updateRoomResponsePromise;
  const updateRoomResponseText = await updateRoomResponse.text();
  expect(
    updateRoomResponse.ok(),
    `Expected room update request to succeed, got ${updateRoomResponse.status()} ${updateRoomResponse.url()} body=${updateRoomResponse.request().postData() ?? '<none>'} response=${updateRoomResponseText}`
  ).toBeTruthy();

  const renamedRoomChip = roomsPanel
    .locator('div.flex.items-center.gap-2.px-3.py-1\\.5.bg-gray-100.rounded-full.text-sm.text-gray-700')
    .filter({ hasText: renamedRoom })
    .first();
  await expect(renamedRoomChip).toBeVisible();
  await expect(choreRow).toContainText(`Rooms: ${renamedRoom}`);
  await expect(choreRow).not.toContainText(roomName);

  // Delete room and verify chore room label is removed
  const deleteRoomResponsePromise = page.waitForResponse(
    (resp) =>
      resp.request().method() === 'DELETE' &&
      /\/rooms\/[^/]+$/.test(new URL(resp.url()).pathname)
  );
  await renamedRoomChip.getByRole('button', { name: 'x' }).click();
  await expect(page.getByRole('heading', { name: 'Confirm Action' })).toBeVisible();
  await page.getByRole('button', { name: 'Delete' }).click();

  const deleteRoomResponse = await deleteRoomResponsePromise;
  const deleteRoomResponseText = await deleteRoomResponse.text();
  expect(
    deleteRoomResponse.ok(),
    `Expected room delete request to succeed, got ${deleteRoomResponse.status()} ${deleteRoomResponse.url()} response=${deleteRoomResponseText}`
  ).toBeTruthy();

  await expect(page.getByRole('heading', { name: 'Confirm Action' })).toHaveCount(0);
  await expect(
    roomsPanel
      .locator('div.flex.items-center.gap-2.px-3.py-1\\.5.bg-gray-100.rounded-full.text-sm.text-gray-700')
      .filter({ hasText: renamedRoom })
  ).toHaveCount(0);
  await expect(choreRow).not.toContainText(renamedRoom);
});

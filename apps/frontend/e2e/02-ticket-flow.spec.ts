import { test, expect } from '@playwright/test';

test.describe('Ticket — flujo completo', () => {

  test('carga la vista de tickets', async ({ page }) => {
    await page.goto('/helpdesk');
    // Ticket list or workspace should load
    await expect(page.locator('h1, [class*="title"], [class*="heading"]').first()).toBeVisible({ timeout: 10_000 });
    await expect(page).not.toHaveURL(/\/login/);
  });

  test('crear ticket — drawer abre y valida campos requeridos', async ({ page }) => {
    await page.goto('/helpdesk');
    await page.waitForLoadState('networkidle', { timeout: 15_000 });

    const createBtn = page
      .getByRole('button', { name: /reportar nuevo incidente|crear nuevo ticket/i })
      .first();
    await expect(createBtn).toBeVisible({ timeout: 8_000 });
    await createBtn.click();

    // Drawer opens with correct heading
    await expect(page.getByText('Nuevo ticket')).toBeVisible({ timeout: 5_000 });

    // Title input is present and accepts input
    const titleInput = page.getByPlaceholder(/describe el problema/i);
    await expect(titleInput).toBeVisible();
    await titleInput.fill(`E2E Test ${Date.now()}`);

    // Category select is present
    const categorySelect = page.locator('form#create-ticket-form select').first();
    await expect(categorySelect).toBeVisible();

    // Submit button exists (enabled only when both title + category filled)
    const submitBtn = page.locator('[class*="btnSubmit"]');
    await expect(submitBtn).toBeVisible();

    // Try to submit without category — button should still be disabled
    await expect(submitBtn).toBeDisabled();

    // Cancel closes the drawer
    await page.locator('button').filter({ hasText: /cancelar/i }).click();
    await expect(page.getByText('Nuevo ticket')).not.toBeVisible({ timeout: 3_000 });
  });

  test('abrir ticket muestra workspace', async ({ page }) => {
    await page.goto('/helpdesk');
    await page.waitForLoadState('networkidle', { timeout: 15_000 });

    // Click first ticket row
    const firstTicket = page.locator('[class*="ticketRow"], [class*="ticket-row"], [data-ticket-id]').first();
    if (await firstTicket.count() > 0) {
      await firstTicket.click();
      // Workspace or detail panel should open
      await expect(
        page.locator('[class*="workspace"], [class*="detail"], [class*="panel"]').first()
      ).toBeVisible({ timeout: 8_000 });
    } else {
      // No tickets yet — skip gracefully
      test.skip();
    }
  });

  test('navegación a /helpdesk/queue carga la cola', async ({ page }) => {
    await page.goto('/helpdesk/queue');
    await page.waitForLoadState('networkidle', { timeout: 15_000 });
    await expect(page).not.toHaveURL(/\/login/);
    // Queue title or table header should be visible
    await expect(
      page.locator('h1, [class*="queueHeader"], [class*="tableGrid"]').first()
    ).toBeVisible({ timeout: 8_000 });
  });

  test('navegación a /helpdesk/workspace carga el workspace', async ({ page }) => {
    await page.goto('/helpdesk/workspace');
    await page.waitForLoadState('networkidle', { timeout: 15_000 });
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.locator('h1, [class*="title"]').first()).toBeVisible({ timeout: 8_000 });
  });
});

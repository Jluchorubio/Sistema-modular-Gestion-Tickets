import { test, expect } from '@playwright/test';
import { loginAs } from './helpers';

test.describe('Ticket — flujo completo', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page);
  });

  test('carga la vista de tickets', async ({ page }) => {
    await page.goto('/helpdesk');
    // Ticket list or workspace should load
    await expect(page.locator('h1, [class*="title"], [class*="heading"]').first()).toBeVisible({ timeout: 10_000 });
    await expect(page).not.toHaveURL(/\/login/);
  });

  test('crear ticket y aparece en lista', async ({ page }) => {
    await page.goto('/helpdesk');

    // Wait for the page to fully load
    await page.waitForLoadState('networkidle', { timeout: 15_000 });

    // Open create drawer via title button or "Reportar Nuevo Incidente"
    const createBtn = page
      .getByRole('button', { name: /reportar nuevo incidente|crear nuevo ticket/i })
      .first();
    await expect(createBtn).toBeVisible({ timeout: 8_000 });
    await createBtn.click();

    // Drawer should open — fill title (required)
    const titleInput = page.getByPlaceholder(/describe el problema/i);
    await expect(titleInput).toBeVisible({ timeout: 5_000 });
    const ticketTitle = `E2E Test ${Date.now()}`;
    await titleInput.fill(ticketTitle);

    // Category select (required) — pick first available option
    const categorySelect = page.locator('select').filter({ hasText: /selecciona|categoría/i }).first();
    if (await categorySelect.count() > 0) {
      const options = await categorySelect.locator('option').allTextContents();
      const validOption = options.find(o => o.trim() && !o.toLowerCase().includes('selecciona'));
      if (validOption) await categorySelect.selectOption({ label: validOption });
    }

    // Submit
    await page.getByRole('button', { name: /registrar ticket|crear ticket|enviar/i }).click();

    // Drawer closes and ticket appears in list
    await expect(titleInput).not.toBeVisible({ timeout: 8_000 });
    await expect(page.getByText(ticketTitle)).toBeVisible({ timeout: 10_000 });
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

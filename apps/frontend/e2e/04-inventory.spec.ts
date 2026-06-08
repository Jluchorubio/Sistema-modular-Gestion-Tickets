import { test, expect } from '@playwright/test';
import { loginAs } from './helpers';

test.describe('Inventario', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page);
  });

  test('carga la lista de activos', async ({ page }) => {
    await page.goto('/inventory');
    await page.waitForLoadState('networkidle', { timeout: 15_000 });

    await expect(page).not.toHaveURL(/\/login/);
    // Inventory page header or asset list should be visible
    await expect(
      page.locator('h1, [class*="inventoryHeader"], [class*="assetList"]').first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test('botón Registrar activo abre el formulario', async ({ page }) => {
    await page.goto('/inventory');
    await page.waitForLoadState('networkidle', { timeout: 15_000 });

    const addBtn = page.getByRole('button', { name: /registrar activo/i }).first();
    await expect(addBtn).toBeVisible({ timeout: 8_000 });
    await addBtn.click();

    // Form / drawer should appear with "Nuevo activo" heading
    await expect(page.getByText('Nuevo activo')).toBeVisible({ timeout: 5_000 });
  });

  test('formulario nuevo activo requiere nombre', async ({ page }) => {
    await page.goto('/inventory');
    await page.waitForLoadState('networkidle', { timeout: 15_000 });

    const addBtn = page.getByRole('button', { name: /registrar activo/i }).first();
    await addBtn.click();
    await expect(page.getByText('Nuevo activo')).toBeVisible({ timeout: 5_000 });

    // Submit without filling name
    await page.getByRole('button', { name: /registrar activo/i }).last().click();

    // Should show validation error or stay on the form
    await expect(page.getByText('Nuevo activo')).toBeVisible({ timeout: 3_000 });
  });

  test('activo existente abre ficha de detalle', async ({ page }) => {
    await page.goto('/inventory');
    await page.waitForLoadState('networkidle', { timeout: 15_000 });

    // Find a clickable asset row
    const assetRow = page
      .locator('[class*="assetRow"], [class*="asset-row"], [data-asset-id], tr[class*="row"]')
      .first();

    if (await assetRow.count() === 0) {
      test.skip(); // No assets in DB
    }

    await assetRow.click();
    // Should navigate to /inventory/[id]
    await expect(page).toHaveURL(/\/inventory\/[a-z0-9-]+$/, { timeout: 8_000 });
    // Detail page renders asset name
    await expect(page.locator('h1, [class*="assetName"]').first()).toBeVisible({ timeout: 8_000 });
  });

  test('ficha de activo tiene sección de historial', async ({ page }) => {
    await page.goto('/inventory');
    await page.waitForLoadState('networkidle', { timeout: 15_000 });

    const assetRow = page
      .locator('[class*="assetRow"], [class*="asset-row"], [data-asset-id]')
      .first();

    if (await assetRow.count() === 0) test.skip();

    await assetRow.click();
    await expect(page).toHaveURL(/\/inventory\/[a-z0-9-]+$/, { timeout: 8_000 });

    // History link in the asset detail
    const historyLink = page.getByRole('link', { name: /historial/i });
    await expect(historyLink).toBeVisible({ timeout: 5_000 });
    await historyLink.click();
    await expect(page).toHaveURL(/\/inventory\/[a-z0-9-]+\/history/, { timeout: 5_000 });
    await expect(page.getByText(/historial y auditoría/i)).toBeVisible({ timeout: 8_000 });
  });
});

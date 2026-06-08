import { test, expect } from '@playwright/test';
import { loginAs } from './helpers';

test.describe('Permisos RBAC', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page); // superadmin
  });

  test('superadmin ve /config sin redirección', async ({ page }) => {
    await page.goto('/config');
    await page.waitForLoadState('networkidle', { timeout: 15_000 });
    await expect(page).not.toHaveURL(/\/login|\/dashboard/);
    // Config page has section headers
    await expect(
      page.locator('h1, [class*="configTitle"], [class*="title"]').first()
    ).toBeVisible({ timeout: 8_000 });
  });

  test('superadmin ve sección de usuarios /users', async ({ page }) => {
    await page.goto('/users');
    await page.waitForLoadState('networkidle', { timeout: 15_000 });
    await expect(page).not.toHaveURL(/\/login/);
    await expect(
      page.locator('h1, [class*="usersHeader"], [class*="pageTitle"]').first()
    ).toBeVisible({ timeout: 8_000 });
  });

  test('superadmin puede acceder a /helpdesk/config', async ({ page }) => {
    await page.goto('/helpdesk/config');
    await page.waitForLoadState('networkidle', { timeout: 15_000 });
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.getByText(/configuración.*helpdesk/i)).toBeVisible({ timeout: 8_000 });
  });

  test('superadmin ve todas las tabs de config helpdesk', async ({ page }) => {
    await page.goto('/helpdesk/config');
    await page.waitForLoadState('networkidle', { timeout: 15_000 });

    const expectedTabs = ['General', 'SLA Tickets', 'Tipos de Daño', 'Calendario', 'Flujo'];
    for (const tabLabel of expectedTabs) {
      await expect(page.getByRole('button', { name: tabLabel })).toBeVisible({ timeout: 5_000 });
    }
  });

  test('ruta /dashboard carga sin error', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle', { timeout: 15_000 });
    await expect(page).not.toHaveURL(/\/login/);
    await expect(
      page.locator('[class*="dashCard"], [class*="card"], main').first()
    ).toBeVisible({ timeout: 8_000 });
  });

  test('ruta inexistente redirige o muestra 404', async ({ page }) => {
    await page.goto('/ruta-que-no-existe-xyz');
    await page.waitForLoadState('networkidle', { timeout: 10_000 });
    // Either a 404 page or redirect to dashboard
    const is404 = await page.locator('text=/404|no encontrada|not found/i').count() > 0;
    const isDash = page.url().includes('/dashboard');
    expect(is404 || isDash).toBeTruthy();
  });
});

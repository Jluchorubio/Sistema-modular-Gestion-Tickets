import { test, expect } from '@playwright/test';

test.describe('Permisos RBAC', () => {

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
    await expect(page.getByRole('heading', { name: /configuración.*helpdesk/i })).toBeVisible({ timeout: 8_000 });
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
    // Unknown route: Next.js 404 ("Página no encontrada"), or
    // matched by [moduleSlug] catch-all ("Módulo no encontrado."), or redirect
    const is404    = await page.getByText(/Página no encontrada/i).count() > 0;
    const isNoMod  = await page.getByText(/Módulo no encontrado/i).count() > 0;
    const isDash   = page.url().includes('/dashboard');
    const isAnyApp = /\/(dashboard|helpdesk|inventory|tickets|config|users)/.test(page.url());
    expect(is404 || isNoMod || isDash || isAnyApp).toBeTruthy();
  });
});

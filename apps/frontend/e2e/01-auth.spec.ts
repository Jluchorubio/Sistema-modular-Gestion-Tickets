import { test, expect } from '@playwright/test';
import { ADMIN_EMAIL, ADMIN_PASSWORD, loginAs, logout } from './helpers';

test.describe('Auth', () => {
  test('login con credenciales válidas redirige a dashboard', async ({ page }) => {
    await page.goto('/login');

    await page.getByPlaceholder('example@gmail.com').fill(ADMIN_EMAIL);
    await page.getByPlaceholder('••••••••').fill(ADMIN_PASSWORD);
    await page.getByRole('button', { name: 'Login' }).click();

    await expect(page).not.toHaveURL(/\/login/, { timeout: 12_000 });
    // Should land on dashboard or app route
    await expect(page).toHaveURL(/\/(dashboard|helpdesk|tickets)/, { timeout: 5_000 });
  });

  test('credenciales incorrectas muestran error', async ({ page }) => {
    await page.goto('/login');

    await page.getByPlaceholder('example@gmail.com').fill('wrong@test.com');
    await page.getByPlaceholder('••••••••').fill('wrongpassword123');
    await page.getByRole('button', { name: 'Login' }).click();

    // Error message or "intentos restantes" should appear
    await expect(
      page.locator('[class*="msgBanner"], [class*="msg"], [class*="error"]').first()
    ).toBeVisible({ timeout: 8_000 });
  });

  test('campo vacío bloquea submit (validación frontend)', async ({ page }) => {
    await page.goto('/login');

    // Submit with empty fields
    await page.getByRole('button', { name: 'Login' }).click();

    // RHF validation triggers — button stays on /login
    await expect(page).toHaveURL(/\/login/);
  });

  test('logout regresa a /login', async ({ page }) => {
    await loginAs(page);
    await logout(page);
    await expect(page).toHaveURL(/\/login/);
  });
});

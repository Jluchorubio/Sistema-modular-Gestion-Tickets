import { Page, expect } from '@playwright/test';

export const ADMIN_EMAIL    = process.env.E2E_ADMIN_EMAIL    ?? 'joselu.rubio2008@gmail.com';
export const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'AdminPass2025!';

export async function loginAs(page: Page, email = ADMIN_EMAIL, password = ADMIN_PASSWORD) {
  await page.goto('/login');
  await page.getByPlaceholder('example@gmail.com').fill(email);
  await page.getByPlaceholder('••••••••').fill(password);
  await page.getByRole('button', { name: 'Login' }).click();
  await expect(page).not.toHaveURL(/\/login/, { timeout: 12_000 });
}

export async function logout(page: Page) {
  // Open profile dropdown (aria-expanded button in AppHeader)
  const profileTrigger = page.locator('[class*="trigger"][aria-expanded]').first();
  await profileTrigger.click();
  await page.getByRole('button', { name: /cerrar sesión/i }).click();
  await expect(page).toHaveURL(/\/login/, { timeout: 8_000 });
}

export async function waitForToast(page: Page, text: RegExp | string, timeout = 8_000) {
  await expect(
    page.locator('[role="status"], [data-sonner-toast], .toast, [class*="toast"]').filter({ hasText: text })
  ).toBeVisible({ timeout });
}

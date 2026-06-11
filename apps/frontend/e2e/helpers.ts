import { Page, expect } from '@playwright/test';

export const ADMIN_EMAIL    = process.env.E2E_ADMIN_EMAIL    ?? 'joselu.rubio2008@gmail.com';
export const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'AdminPass2025!';

export async function loginAs(page: Page, email = ADMIN_EMAIL, password = ADMIN_PASSWORD) {
  await page.goto('/login');
  await page.getByPlaceholder('example@gmail.com').fill(email);
  await page.getByPlaceholder('••••••••').fill(password);
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await expect(page).not.toHaveURL(/\/login/, { timeout: 12_000 });
}

export async function logout(page: Page) {
  // Click profile trigger inside profileWrap (AppHeader)
  await page.locator('[class*="profileWrap"] > button').click();
  // Wait for dropdown to become visible (.dropdownOpen = display:block)
  await page.locator('[class*="dropdownOpen"]').waitFor({ state: 'visible', timeout: 5_000 });
  // Click logout button (ddDanger class)
  await page.locator('[class*="ddDanger"]').click();
  await expect(page).toHaveURL(/\/login/, { timeout: 8_000 });
}

export async function waitForToast(page: Page, text: RegExp | string, timeout = 8_000) {
  await expect(
    page.locator('[role="status"], [data-sonner-toast], .toast, [class*="toast"]').filter({ hasText: text })
  ).toBeVisible({ timeout });
}

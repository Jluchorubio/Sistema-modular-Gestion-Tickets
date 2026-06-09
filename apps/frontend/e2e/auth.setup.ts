import { test as setup } from '@playwright/test';
import { loginAs } from './helpers';
import path from 'path';

const authFile = path.join(__dirname, '.auth', 'user.json');

setup('authenticate', async ({ page }) => {
  await loginAs(page);
  // Save auth state (localStorage tokens + cookies)
  await page.context().storageState({ path: authFile });
});

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [['html', { open: 'never' }], ['list']],

  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'off',
  },

  projects: [
    // Setup: log in once and save auth state
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
    },
    // Auth tests: no stored state (test login/logout from scratch)
    {
      name: 'auth-tests',
      testMatch: /01-auth\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    // All other tests: reuse saved auth state — avoids throttle
    {
      name: 'app-tests',
      testMatch: /0[2-9]-.*\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'e2e/.auth/user.json',
      },
      dependencies: ['setup'],
    },
  ],

  webServer: process.env.PLAYWRIGHT_NO_SERVER
    ? undefined
    : {
        command: 'npm run dev',
        url: 'http://localhost:3000',
        reuseExistingServer: true,
        timeout: 120_000,
      },
});

import { defineConfig, devices } from '@playwright/test';

// End-to-end tests: a fresh production build, served the way production
// serves it (scripts/preview.mjs), in Chromium. Every request to another
// host is answered by fixtures (test/e2e/fixtures.ts), so the tests never
// touch the network.
//
//   npm run test:e2e
//
// E2E_PORT changes the port. CHROMIUM_EXECUTABLE runs an installed Chromium
// instead of the one `npx playwright install chromium` downloads.

const port = Number(process.env.E2E_PORT ?? 8107);
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  testDir: 'test/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // fixed, so rate-limit reset times render the same everywhere
    locale: 'en-US',
    timezoneId: 'UTC'
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          executablePath: process.env.CHROMIUM_EXECUTABLE || undefined,
          // A request that gets past the fixtures fails instead of reaching
          // the network (Playwright doesn't route the request a fulfilled
          // redirect leads to, for one).
          args: [
            '--no-proxy-server',
            '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost'
          ]
        }
      }
    }
  ],
  webServer: {
    command: 'npm run build && npm run preview',
    url: baseURL + '/',
    // the default settings, which the tests' expected links assume
    env: {
      PORT: String(port),
      NBVIEWER_URL: 'https://nbviewer.org/',
      BINDER_URL: 'https://mybinder.org/v2'
    },
    // never test some other server (or an older build) on the same port
    reuseExistingServer: false,
    timeout: 120_000
  }
});

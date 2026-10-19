import { defineConfig } from '@playwright/test';
import config from './src/config/config';

export default defineConfig({
    testDir: './src/tests',
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 1 : 0,
    timeout: 30_000,
    reporter: [['list'], ['html', { open: 'never' }]],
    use: {
        baseURL: config.API_BASE_URL,
        trace: 'on-first-retry',
    },
    projects: [{ name: 'api' }],
    // Boots nova-wallet-api itself so `npm test` is self-sufficient locally and
    // in CI. If you point API_BASE_URL at an already-running/remote instance,
    // reuseExistingServer picks that up instead of spawning a second one.
    webServer: {
        command: 'npm run build --prefix ../nova-wallet-api && npm run start --prefix ../nova-wallet-api',
        url: `${config.API_BASE_URL}/health`,
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
    },
});

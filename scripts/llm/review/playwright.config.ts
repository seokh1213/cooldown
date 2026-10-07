import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: '../../../tests/review', fullyParallel: true, workers: 2,
  outputDir: '../../../research/.cache/review-browser', reporter: 'list',
  use: { channel: 'chrome' },
  projects: ['light', 'dark'].flatMap(colorScheme => [
    { name: `desktop-${colorScheme}`, use: { viewport: { width: 1440, height: 900 }, colorScheme: colorScheme as 'light' | 'dark' } },
    { name: `mobile-${colorScheme}`, use: { viewport: { width: 320, height: 800 }, colorScheme: colorScheme as 'light' | 'dark' } },
  ]),
});

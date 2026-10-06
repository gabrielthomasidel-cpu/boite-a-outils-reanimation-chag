// Configuration des tests automatisés. Les pages sont ouvertes directement
// depuis le disque (file://), comme le fait le lanceur Windows dans Edge.
// Chromium : `npx playwright install chromium`, ou chemin d'un navigateur
// existant dans la variable CHROMIUM_PATH.
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './specs',
  timeout: 45000,
  fullyParallel: true,
  reporter: [['list']],
  use: {
    viewport: { width: 1366, height: 768 },
    launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
  },
});

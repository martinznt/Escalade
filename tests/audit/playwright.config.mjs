// tests/audit/playwright.config.mjs — suite d'audit fonctionnel de « Mes séances ».
// Lancer : node node_modules/playwright/cli.js test -c tests/audit/playwright.config.mjs --project=chromium-phone390
// Chromium système : PW_EXEC=/chemin/vers/chromium. Aucun retry automatique : un test instable reste visible.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from 'playwright/test';

const here = path.dirname(fileURLToPath(import.meta.url)), out = process.env.AUDIT_OUT || path.join(here, 'results');
// Sans langue UTF-8 (conteneur en « C »), Chromium ignore sans message un fichier choisi par son chemin dès que ce
// chemin contient un accent (les dossiers de résultats portent le titre du test) : le navigateur reçoit donc une langue
// UTF-8. Défaut de l'environnement de test, pas du site (un vrai choix de fichier ne passe pas par ce chemin).
const utf8 = /utf-?8/i.test(process.env.LC_ALL || process.env.LC_CTYPE || process.env.LANG || '') ? {} : { env: { ...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' } };
const exe = { launchOptions: { ...(process.env.PW_EXEC ? { executablePath: process.env.PW_EXEC } : {}), ...utf8 } };
const chromium = (name, use) => ({ name, testIgnore: /api\.spec/, use: { browserName: 'chromium', ...use, ...exe } });
export default defineConfig({
  testDir: here, testMatch: /.*\.spec\.mjs/,
  fullyParallel: true, workers: Number(process.env.AUDIT_WORKERS || 3), retries: 0, timeout: 60000, expect: { timeout: 7000 },
  outputDir: path.join(out, 'artifacts'),
  reporter: [['line'], ['json', { outputFile: path.join(out, 'results.json') }], ['html', { outputFolder: path.join(out, 'html'), open: 'never' }]],
  use: { locale: 'fr-FR', timezoneId: 'Europe/Paris', serviceWorkers: 'block', trace: 'retain-on-failure', screenshot: 'only-on-failure', actionTimeout: 8000, acceptDownloads: true },
  projects: [
    chromium('chromium-small320', { viewport: { width: 320, height: 640 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }),
    chromium('chromium-small360', { viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 }),
    chromium('chromium-phone390', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 }),
    chromium('chromium-android', { ...devices['Pixel 7'] }),
    chromium('chromium-tablet', { viewport: { width: 768, height: 1024 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }),
    chromium('chromium-desktop', { viewport: { width: 1440, height: 900 } }),
    // Navigateurs déclarés pour être relancés ailleurs : absents de l'environnement d'audit (installation interdite).
    { name: 'firefox-desktop', testIgnore: /api\.spec/, use: { browserName: 'firefox', viewport: { width: 1440, height: 900 }, launchOptions: { ...utf8 } } },
    { name: 'webkit-iphone', testIgnore: /api\.spec/, use: { ...devices['iPhone 13'], launchOptions: { ...utf8 } } },
    // Tests sans navigateur (droits, API, données) : une seule fois.
    { name: 'api', testMatch: /api\.spec\.mjs/, use: { browserName: 'chromium', ...exe } },
  ],
});

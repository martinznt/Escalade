// Exécute le vrai gestionnaire push du SW, sans navigateur ni notification système.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { ok, done } from './helpers.mjs';

const source = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
async function receive(reply, { offline = false } = {}) {
  const handlers = {}, notices = []; let fetchOptions;
  const self = {
    addEventListener: (name, callback) => { handlers[name] = callback; },
    registration: {
      pushManager: { getSubscription: async () => ({ endpoint: 'https://push.test/subscription' }) },
      showNotification: async (title, options) => { notices.push({ title, ...options }); },
    },
  };
  vm.runInNewContext(source, {
    self, URL, Intl, location: { origin: 'https://site.test' },
    fetch: async (_url, options) => { fetchOptions = options; if (offline) throw new Error('Hors ligne'); return { ok: true, json: async () => reply }; },
  });
  let pending; handlers.push({ waitUntil: (promise) => { pending = promise; } }); await pending;
  assert.equal(notices.length, 1); assert.equal(fetchOptions.credentials, 'include'); assert.equal(fetchOptions.cache, 'no-store');
  return notices[0];
}

await ok('push : icône et badge prédéfinis réellement transmis à showNotification', async () => {
  const reply = { title: 'Annonce', body: 'À lire', url: '/#/home/dash', silent: true, icon: '/app-icon-gold-v1-192.png', badge: '/app-icon-gold-v1-badge-96.png' };
  const shown = await receive(reply);
  assert.equal(shown.icon, reply.icon); assert.equal(shown.badge, reply.badge); assert.equal(shown.silent, true); assert.equal(shown.data.url, reply.url);
});

await ok('push : création personnelle opaque autorisée pour grande icône et badge', async () => {
  const token = 'A'.repeat(43), reply = { icon: `/app-icons-custom/${token}/192.png`, badge: `/app-icons-custom/${token}/badge-96.png` };
  const shown = await receive(reply); assert.equal(shown.icon, reply.icon); assert.equal(shown.badge, reply.badge);
});

await ok('push : URL étrangère, traversée et token invalide retombent sur les images locales', async () => {
  for (const path of ['https://foreign.test/image.png','//foreign.test/image.png','/app-icons-custom/../../192.png','/app-icons-custom/short/192.png','/app-icon-gold-v1-512.png']) {
    const shown = await receive({ icon: path, badge: path }); assert.equal(shown.icon, '/icon-192.png'); assert.equal(shown.badge, '/badge-96.png');
  }
});

await ok('push hors ligne : texte et images par défaut disponibles sans données de compte', async () => {
  const shown = await receive({}, { offline: true });
  assert.equal(shown.title, 'Séances entraînement'); assert.equal(shown.icon, '/icon-192.png'); assert.equal(shown.badge, '/badge-96.png'); assert.equal(shown.data.url, '/#/home/dash');
});
done('tests SW apparence des notifications');

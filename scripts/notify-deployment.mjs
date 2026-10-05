// Réveil du Worker après le succès du déploiement : le serveur vérifie sa propre version avant tout envoi.
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export async function notifyDeployment({ version, fetchFn = fetch, waitFn = (ms) => new Promise((r) => setTimeout(r, ms)), attempts = 12, delay = 5000 } = {}) {
  if (!/^\d+\.\d+\.\d+$/.test(String(version || ''))) throw new Error('Version de publication invalide.');
  const url = 'https://seances-entrainement.martin-zannet22.workers.dev/api/version?expected=' + encodeURIComponent(version);
  let reason = 'Serveur inaccessible';
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetchFn(url, { cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(20000) });
      const data = await res.json();
      if (res.ok && data.version === version && data.announced === true) return data;
      reason = `Version attendue ${version}, serveur ${data.version || res.status}`;
    } catch (e) { reason = String(e.message || e); }
    if (i + 1 < attempts) await waitFn(delay);
  }
  throw new Error(`Annonce non confirmée : ${reason}. La tâche planifiée reprend les envois chaque minute.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const source = await readFile(new URL('../public/state.js', import.meta.url), 'utf8');
  const version = source.match(/export const APP_VERSION = '(\d+\.\d+\.\d+)'/)?.[1];
  const result = await notifyDeployment({ version });
  console.log(`Déploiement ${result.version} confirmé ; notifications déclenchées sur ${result.build}.`);
}

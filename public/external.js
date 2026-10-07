// Provenance des imports : utilisables dans les analyses personnelles, exclus du partage automatique.
const PROVIDERS = new Set(['strava', 'file']);
export function cleanExternal(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !PROVIDERS.has(value.provider)) return null;
  const id = String(value.id || '').slice(0, 100);
  if (!/^[\w:.-]{1,100}$/.test(id)) return null;
  return { provider: value.provider, id, channel: value.provider === 'strava' && value.channel === 'api' ? 'api' : 'file', private: true, excludeAI: true };
}
export const externalOf = (entry) => entry?.data?.external || entry?.external || (/^csv-[a-z0-9]+$/.test(entry?.id || '') ? { provider: 'file', id: entry.id, channel: 'file', private: true, excludeAI: true } : null);
export const isExternal = (entry) => !!externalOf(entry);
export const externalProvider = (entry) => externalOf(entry)?.provider || '';
export const externalLabel = (entry) => externalProvider(entry) === 'strava' ? 'Strava' : 'Fichier importé';

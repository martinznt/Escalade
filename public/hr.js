// hr.js — ceinture (ou montre) cardio Bluetooth, profil standard « Heart Rate » (Chrome / Edge sur Android et ordinateur).
// Aucune donnée ne quitte l'appareil pendant la séance : on garde seulement la moyenne et le maximum, enregistrés
// avec la séance. Sur iPhone, le Bluetooth web n'existe pas : le bouton ne s'affiche pas.
const HR = { dev: null, ch: null, bpm: 0, at: 0, listeners: new Set() };

export const hrSupported = () => !!navigator.bluetooth?.requestDevice;
export const hrConnected = () => !!HR.ch && Date.now() - HR.at < 15000;
export const hrNow = () => (hrConnected() ? HR.bpm : 0);
export const onHr = (fn) => { HR.listeners.add(fn); return () => HR.listeners.delete(fn); };

/** Lit une mesure « Heart Rate Measurement » (octet de drapeaux, puis BPM sur 8 ou 16 bits). */
export function parseHr(view) {
  if (!view || view.byteLength < 2) return 0;
  const flags = view.getUint8(0);
  return flags & 1 ? (view.byteLength >= 3 ? view.getUint16(1, true) : 0) : view.getUint8(1);
}

export async function hrConnect() {
  if (!hrSupported()) throw new Error('Bluetooth indisponible sur ce navigateur.');
  const dev = await navigator.bluetooth.requestDevice({ filters: [{ services: ['heart_rate'] }] });
  const server = await dev.gatt.connect();
  const ch = await (await server.getPrimaryService('heart_rate')).getCharacteristic('heart_rate_measurement');
  ch.addEventListener('characteristicvaluechanged', (e) => {
    const bpm = parseHr(e.target.value);
    if (bpm > 20 && bpm < 250) { HR.bpm = bpm; HR.at = Date.now(); for (const fn of HR.listeners) fn(bpm); }
  });
  await ch.startNotifications();
  dev.addEventListener('gattserverdisconnected', () => { HR.ch = null; });
  HR.dev = dev; HR.ch = ch;
  return dev.name || 'Capteur cardio';
}
export function hrDisconnect() { try { HR.dev?.gatt?.disconnect(); } catch { /* rien */ } HR.dev = null; HR.ch = null; HR.bpm = 0; }

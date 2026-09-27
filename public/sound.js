// sound.js — bips des chronos, avec un style au choix (bip, cloche, bois, doux) et un volume réglable.
import { S } from './state.js';

let ctx = null;
const STYLES = {
  bip: { wave: 'sine', mul: 1, decay: 0 },
  cloche: { wave: 'sine', mul: 1.5, decay: 0.9 },
  bois: { wave: 'triangle', mul: 0.8, decay: 0.12, short: true },
  doux: { wave: 'sine', mul: 0.6, decay: 0.5, soft: true },
};
export const SOUND_STYLES = [['bip', 'Bip'], ['cloche', 'Cloche'], ['bois', 'Bois'], ['doux', 'Doux']];
export function beep(f = 880, ms = 150) {
  if (!S.settings.sound) return;
  try {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    const st = STYLES[S.settings.soundStyle] || STYLES.bip, vol = Math.max(0, Math.min(1, (S.settings.volume ?? 60) / 100));
    const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime;
    const len = st.short ? Math.min(ms, 90) / 1000 : Math.max(ms / 1000, st.decay || 0);
    o.type = st.wave; o.frequency.value = f * st.mul;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, 0.25 * vol * (st.soft ? 0.6 : 1)), t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(g); g.connect(ctx.destination); o.start(t); o.stop(t + len + 0.02);
  } catch { /* pas d'audio sur cet appareil */ }
}

// views-motiv.js — carte « série de semaines », badges (et fête quand un nouveau tombe), bilan du mois en image.
import { h, openSheet, closeSheet, toast } from './ui.js';
import { S, ACT, ctx, itemsOf, item, ls } from './state.js';
import { weekStreak, badges, monthRecap } from './motivation.js';
import { timeline, activityLabel } from './brain.js';
import { celebrate } from './fx.js';

const goalPerWeek = () => Math.max(1, Math.min(4, Number(item('config', 'main')?.perWeek) || 2));
export function motivCtx() {
  const c = ctx();
  let rec = 0; try { rec = timeline(c).filter((e) => e.kind === 'record').length; } catch { /* rien */ }
  return { ...c, projects: itemsOf('project'), recordsCount: rec };
}

export function streakCard() {
  const c = ctx(), st = weekStreak(c.history, c.ascents, { goal: goalPerWeek() });
  const dots = Array.from({ length: st.goal }, (_, i) => h`<i class="${i < st.thisWeek ? 'on' : ''}"></i>`);
  return h`<section class="card streak ${st.streak ? 'hot' : ''}"><div class="row"><div class="flame">${st.streak ? '🔥' : '🌱'}</div>
      <div class="grow"><b class="big">${st.streak ? `${st.streak} semaine${st.streak > 1 ? 's' : ''} d’affilée` : 'Lance ta série'}</b>
      <div class="small">${st.done ? 'Objectif de la semaine atteint 👏' : `Cette semaine : encore ${st.left} séance${st.left > 1 ? 's' : ''}${st.streak ? ' pour continuer' : ''}`}</div></div>
      <div class="wkdots" aria-label="${st.thisWeek} sur ${st.goal} cette semaine">${dots}</div></div>
    ${st.best > st.streak ? h`<p class="tiny muted">Ta meilleure série : ${st.best} semaines.</p>` : ''}</section>`;
}

export function badgesCard() {
  const list = badges(motivCtx(), { goal: goalPerWeek() }), got = list.filter((b) => b.got), next = list.filter((b) => !b.got).sort((a, b) => b.value / b.target - a.value / a.target);
  return h`<section class="card"><div class="row between"><h3>🏅 Badges</h3><span class="small muted">${got.length} / ${list.length}</span></div>
    <div class="badges">${[...got, ...next.slice(0, Math.max(3, 8 - got.length))].map((b) => h`<div class="badge ${b.got ? 'got' : ''}" title="${b.how}"><span class="bi">${b.icon}</span><b>${b.name}</b><small>${b.got ? b.how : `${b.value} / ${b.target}`}</small>${b.got ? '' : h`<div class="bprog"><i style="width:${Math.round((b.value / b.target) * 100)}%"></i></div>`}</div>`)}</div>
    ${next.length > 5 ? h`<details class="how mini"><summary>Tous les badges</summary><div class="badges">${next.slice(Math.max(3, 8 - got.length)).map((b) => h`<div class="badge"><span class="bi">${b.icon}</span><b>${b.name}</b><small>${b.how}</small></div>`)}</div></details>` : ''}</section>`;
}

/** Nouveaux badges depuis la dernière fois : petite fête. Le premier passage enregistre sans rien fêter. */
let lastCheck = 0;
export function checkBadges() {
  if (!S.user || !S.loaded || Date.now() - lastCheck < 1500) return;
  lastCheck = Date.now();
  let list; try { list = badges(motivCtx(), { goal: goalPerWeek() }).filter((b) => b.got).map((b) => b.id); } catch { return; }
  const key = 'sea:badges:' + S.user.id, seen = ls.get(key, null);
  ls.set(key, list);
  if (!seen) return;
  const fresh = list.filter((id) => !seen.includes(id));
  if (!fresh.length) return;
  const b = badges(motivCtx(), { goal: goalPerWeek() }).find((x) => x.id === fresh[0]);
  setTimeout(() => { celebrate({ n: 90 }); toast(`${b.icon} Nouveau badge : ${b.name}`, 4500); }, 400);
}

/* ───────── Bilan du mois en image ───────── */
ACT.recapOpen = async (el) => {
  const back = Number(el?.dataset?.m || 0), d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - back);
  const c = ctx(), r = monthRecap(c, d.getTime()), st = weekStreak(c.history, c.ascents, { goal: goalPerWeek() });
  const cv = drawRecap(r, back ? 0 : st.streak, c);
  const url = cv.toDataURL('image/png');
  S.recap = { cv, name: `bilan-${r.label.replace(/\s+/g, '-')}.png` };
  openSheet(h`<div class="recap"><h2>📸 Mon bilan du mois</h2><div class="seg">${[0, 1].map((m) => h`<button type="button" class="${m === back ? 'on' : ''}" data-act="recapOpen" data-m="${m}">${m ? 'Mois dernier' : 'Ce mois-ci'}</button>`)}</div>
    <img src="${url}" alt="Bilan de ${r.label}" class="recap-img">
    <div class="grid2"><button class="btn pri" data-act="recapShare">Partager</button><button class="btn" data-act="recapSave">Télécharger</button></div></div>`, { wide: true });
};
function drawRecap(r, streak, c) {
  const W = 1080, H = 1350, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d'), css = getComputedStyle(document.documentElement);
  const accent = css.getPropertyValue('--accent').trim() || '#d4a056';
  const bg = g.createLinearGradient(0, 0, W, H); bg.addColorStop(0, '#15151a'); bg.addColorStop(1, '#050507'); g.fillStyle = bg; g.fillRect(0, 0, W, H);
  g.fillStyle = accent; g.globalAlpha = 0.18; g.beginPath(); g.arc(W - 120, 160, 320, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1;
  const font = (w, px) => `${w} ${px}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  g.fillStyle = '#fff'; g.font = font(600, 44); g.fillText('Mon mois de', 80, 150);
  g.font = font(800, 96); g.fillStyle = accent; g.fillText(r.label.charAt(0).toUpperCase() + r.label.slice(1), 80, 250);
  const box = (x, y, big, small) => {
    g.fillStyle = 'rgba(255,255,255,.07)'; roundRect(g, x, y, 440, 240, 36); g.fill();
    g.fillStyle = '#fff'; g.font = font(800, 110); g.fillText(String(big), x + 40, y + 140);
    g.fillStyle = 'rgba(255,255,255,.7)'; g.font = font(600, 38); g.fillText(small, x + 40, y + 200);
  };
  const hrs = r.minutes >= 60 ? `${Math.floor(r.minutes / 60)} h ${String(r.minutes % 60).padStart(2, '0')}` : `${r.minutes} min`;
  box(80, 330, r.sessions, r.sessions > 1 ? 'séances' : 'séance'); box(560, 330, hrs, 'd’entraînement');
  box(80, 610, r.days, r.days > 1 ? 'jours actifs' : 'jour actif'); box(560, 610, r.sends || r.sets, r.sends ? 'blocs / voies réussis' : 'séries');
  let y = 960; g.font = font(600, 42); g.fillStyle = '#fff';
  const line = (t) => { g.fillText(t, 80, y); y += 70; };
  if (r.best) line(`🧗 Meilleur niveau réussi : ${r.best}${r.flashes ? ` · ${r.flashes} flash${r.flashes > 1 ? 's' : ''}` : ''}`);
  if (streak) line(`🔥 ${streak} semaine${streak > 1 ? 's' : ''} d’affilée`);
  const top = Object.entries(r.byAct).sort((a, b) => b[1] - a[1])[0];
  if (top && top[0] !== 'autre') { let lab = top[0]; try { lab = activityLabel(top[0], c); } catch { /* rien */ } line(`⭐ Sport du mois : ${lab}`); }
  if (!r.sessions && !r.sends) line('Un mois pour souffler. Le prochain sera le bon.');
  g.fillStyle = 'rgba(255,255,255,.45)'; g.font = font(600, 34); g.fillText('Séances entraînement', 80, H - 80);
  g.fillStyle = accent; g.fillRect(80, H - 150, 120, 8);
  return cv;
}
function roundRect(g, x, y, w, hh, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + hh, r); g.arcTo(x + w, y + hh, x, y + hh, r); g.arcTo(x, y + hh, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
const recapBlob = () => new Promise((res) => S.recap.cv.toBlob((b) => res(b), 'image/png'));
ACT.recapShare = async () => {
  const blob = await recapBlob(), file = new File([blob], S.recap.name, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file], title: 'Mon bilan du mois' }); return; } catch (e) { if (e?.name === 'AbortError') return; } }
  ACT.recapSave();
};
ACT.recapSave = async () => {
  const blob = await recapBlob(), a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = S.recap.name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  toast('Image enregistrée'); closeSheet();
};

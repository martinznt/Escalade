// fx.js — petits effets visuels : confettis quand un record tombe. Respecte « réduire les animations ».
export function celebrate({ n = 120, ms = 2600 } = {}) {
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.motion === 'off') return;
  const c = document.createElement('canvas'), dpr = Math.min(2, window.devicePixelRatio || 1);
  c.className = 'confetti'; c.width = innerWidth * dpr; c.height = innerHeight * dpr; c.setAttribute('aria-hidden', 'true');
  document.body.appendChild(c);
  const g = c.getContext('2d'); if (!g) { c.remove(); return; }
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#d4a056';
  const colors = [accent, '#5fa8d3', '#5cb87a', '#ef6f5e', '#f472b6', '#ffd60a'];
  const bits = Array.from({ length: n }, () => ({
    x: innerWidth * (0.2 + Math.random() * 0.6), y: innerHeight * 0.35, vx: (Math.random() - 0.5) * 9, vy: -6 - Math.random() * 8,
    r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.3, w: 6 + Math.random() * 6, h: 4 + Math.random() * 4, col: colors[Math.floor(Math.random() * colors.length)],
  }));
  const t0 = performance.now();
  const frame = (t) => {
    const k = (t - t0) / ms; g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, innerWidth, innerHeight);
    for (const b of bits) {
      b.vy += 0.28; b.vx *= 0.99; b.x += b.vx; b.y += b.vy; b.r += b.vr;
      g.save(); g.globalAlpha = Math.max(0, 1 - k * k); g.translate(b.x, b.y); g.rotate(b.r); g.fillStyle = b.col; g.fillRect(-b.w / 2, -b.h / 2, b.w, b.h); g.restore();
    }
    if (k < 1) requestAnimationFrame(frame); else c.remove();
  };
  requestAnimationFrame(frame);
}

import './sparkle-cursor.css';

// A pencil cursor that sheds a short trail of sparkles in the brand colours,
// with a little burst on click. Only for mouse/trackpad devices; anyone who
// prefers reduced motion keeps the pencil but gets no sparkles.

const COLOURS = ['#ec6a93', '#f6a5c0', '#d9527d', '#ffd27a', '#63b3f5'];
const MAX_SPARKLES = 90;
const MIN_TRAIL_GAP = 7; // px the pointer must move before the next sparkle

function pencilSvg(withStar) {
  // Drawn pointing left, then turned 45° so the tip sits at the top-left (the hotspot)
  const star = withStar
    ? "<path d='M26 1.5 Q26.4 5.6 30.5 6 Q26.4 6.4 26 10.5 Q25.6 6.4 21.5 6 Q25.6 5.6 26 1.5 Z' fill='#ffd27a' stroke='#2f2d2b' stroke-width='0.8' stroke-linejoin='round'/>"
    : '';
  return (
    "<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'>" +
    "<g transform='rotate(45 16 16)' stroke='#2f2d2b' stroke-width='1' stroke-linejoin='round'>" +
    "<path d='M1.5 16 L8 12.5 L8 19.5 Z' fill='#f3d9b1'/>" +
    "<path d='M1.5 16 L4 14.65 L4 17.35 Z' fill='#2f2d2b' stroke='none'/>" +
    "<rect x='8' y='12.5' width='16.5' height='7' fill='#ec6a93'/>" +
    "<path d='M8 16 H24.5' stroke='#d9527d'/>" +
    "<rect x='24.5' y='12.5' width='2.5' height='7' fill='#d8cfc3'/>" +
    "<rect x='27' y='12.5' width='3.5' height='7' rx='1.5' fill='#fde6ee'/>" +
    `</g>${star}</svg>`
  );
}

function cursorValue(svg) {
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 6 6`;
}

export function startSparkleCursor() {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  if (!window.matchMedia('(pointer: fine)').matches) return () => {}; // touch screens keep their own

  const root = document.documentElement;
  root.style.setProperty('--pencil-cursor', cursorValue(pencilSvg(false)));
  root.style.setProperty('--pencil-cursor-active', cursorValue(pencilSvg(true)));
  root.classList.add('sparkle-cursor');

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const canvas = document.createElement('canvas');
  canvas.className = 'sparkle-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  const sparkles = [];
  let width = 0;
  let height = 0;
  let frame = 0;
  let lastTime = 0;
  let lastX = null;
  let lastY = null;

  // The canvas is sized by CSS (inset: 0), which leaves out the scrollbar; sizing it to
  // window.innerWidth instead made it poke out and add a sideways scrollbar.
  function resize() {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const nextWidth = canvas.clientWidth;
    const nextHeight = canvas.clientHeight;
    if (!nextWidth || !nextHeight || (nextWidth === width && nextHeight === height)) return;
    width = nextWidth;
    height = nextHeight;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  function spawn(x, y, burst = false) {
    const count = burst ? 12 : Math.random() < 0.4 ? 2 : 1;
    for (let i = 0; i < count; i++) {
      if (sparkles.length >= MAX_SPARKLES) sparkles.shift();
      const angle = burst ? (Math.PI * 2 * i) / count + Math.random() * 0.4 : Math.random() * Math.PI * 2;
      const speed = burst ? 1.6 + Math.random() * 1.4 : 0.2 + Math.random() * 0.5;
      sparkles.push({
        x: burst ? x : x + (Math.random() - 0.5) * 8,
        y: burst ? y : y + (Math.random() - 0.5) * 8,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed + (burst ? 0 : 0.35), // trail sparkles drift down like glitter
        size: (burst ? 5 : 3) + Math.random() * 4,
        life: 650 + Math.random() * 450,
        age: 0,
        rotation: Math.random() * Math.PI,
        spin: (Math.random() - 0.5) * 0.12,
        colour: COLOURS[Math.floor(Math.random() * COLOURS.length)],
      });
    }
    if (!frame) {
      lastTime = performance.now();
      frame = requestAnimationFrame(tick);
    }
  }

  // Four-pointed star with a soft white centre
  function draw(s) {
    const progress = s.age / s.life;
    const r = s.size * (0.6 + 0.4 * Math.sin(progress * Math.PI)); // grows, then shrinks away
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(s.rotation);
    ctx.globalAlpha = 1 - progress;
    ctx.fillStyle = s.colour;
    ctx.beginPath();
    ctx.moveTo(0, -r);
    ctx.quadraticCurveTo(0, 0, r, 0);
    ctx.quadraticCurveTo(0, 0, 0, r);
    ctx.quadraticCurveTo(0, 0, -r, 0);
    ctx.quadraticCurveTo(0, 0, 0, -r);
    ctx.fill();
    ctx.fillStyle = '#fffdfa';
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.18, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function tick(now) {
    const dt = Math.min(now - lastTime, 50);
    const step = dt / 16;
    lastTime = now;
    ctx.clearRect(0, 0, width, height);
    for (let i = sparkles.length - 1; i >= 0; i--) {
      const s = sparkles[i];
      s.age += dt;
      if (s.age >= s.life) {
        sparkles.splice(i, 1);
        continue;
      }
      s.x += s.vx * step;
      s.y += s.vy * step;
      s.vx *= 0.985;
      s.vy += 0.012 * step;
      s.rotation += s.spin * step;
      draw(s);
    }
    frame = sparkles.length ? requestAnimationFrame(tick) : 0;
  }

  function onMove(e) {
    if (reducedMotion.matches || e.pointerType === 'touch') return;
    const x = e.clientX;
    const y = e.clientY;
    if (lastX !== null && Math.hypot(x - lastX, y - lastY) < MIN_TRAIL_GAP) return;
    lastX = x;
    lastY = y;
    spawn(x, y);
  }

  function onDown(e) {
    if (reducedMotion.matches || e.pointerType === 'touch') return;
    spawn(e.clientX, e.clientY, true);
  }

  function onVisibility() {
    if (!document.hidden) return;
    sparkles.length = 0;
    ctx.clearRect(0, 0, width, height);
  }

  resize();
  const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize);
  resizeObserver?.observe(canvas);
  window.addEventListener('resize', resize);
  window.addEventListener('pointermove', onMove, { passive: true });
  window.addEventListener('pointerdown', onDown, { passive: true });
  document.addEventListener('visibilitychange', onVisibility);

  return function stopSparkleCursor() {
    resizeObserver?.disconnect();
    window.removeEventListener('resize', resize);
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerdown', onDown);
    document.removeEventListener('visibilitychange', onVisibility);
    if (frame) cancelAnimationFrame(frame);
    canvas.remove();
    root.classList.remove('sparkle-cursor');
  };
}

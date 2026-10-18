// A cursor spotlight for a grid. One pointermove listener writes --spot-x/--spot-y on each tile
// inside requestAnimationFrame (no reactive state per frame). Keyboard focus moves the light to
// the focused tile; on touch screens the light sits where the middle of the screen crosses the
// grid, so scrolling moves it. Does nothing with prefers-reduced-motion.
import { onMounted, onBeforeUnmount } from 'vue';

export function useSpotlight(gridRef, tileSelector = '[data-spot]') {
  let frame = 0;
  let tiles = [];
  let cleanup = [];

  function measure() {
    tiles = gridRef.value ? [...gridRef.value.querySelectorAll(tileSelector)] : [];
  }

  function lightAt(clientX, clientY) {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      for (const el of tiles) {
        const r = el.getBoundingClientRect();
        el.style.setProperty('--spot-x', `${clientX - r.left}px`);
        el.style.setProperty('--spot-y', `${clientY - r.top}px`);
      }
    });
  }

  onMounted(() => {
    const grid = gridRef.value;
    if (!grid || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    measure();
    const observer = new MutationObserver(measure);
    observer.observe(grid, { childList: true, subtree: true });

    const onFocus = (e) => {
      const tile = e.target.closest?.(tileSelector);
      if (!tile) return;
      const r = tile.getBoundingClientRect();
      lightAt(r.left + r.width / 2, r.top + r.height / 2);
    };
    grid.addEventListener('focusin', onFocus);
    cleanup.push(() => grid.removeEventListener('focusin', onFocus), () => observer.disconnect());

    if (window.matchMedia('(hover: none)').matches) {
      const onScroll = () => lightAt(window.innerWidth / 2, window.innerHeight / 2);
      window.addEventListener('scroll', onScroll, { passive: true });
      onScroll();
      cleanup.push(() => window.removeEventListener('scroll', onScroll));
    } else {
      const onMove = (e) => lightAt(e.clientX, e.clientY);
      grid.addEventListener('pointermove', onMove);
      cleanup.push(() => grid.removeEventListener('pointermove', onMove));
    }
  });

  onBeforeUnmount(() => {
    cancelAnimationFrame(frame);
    cleanup.forEach((fn) => fn());
    cleanup = [];
  });
}

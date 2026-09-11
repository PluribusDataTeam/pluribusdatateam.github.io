/**
 * Site-wide behaviors. Everything is keyed on data attributes / classes and
 * re-initialised on every `astro:page-load` so it survives view transitions.
 *
 *  .reveal            fade/rise in when scrolled into view
 *  [data-split]       split words into spans for staggered entrance
 *  [data-words]       scroll-linked word-by-word text illumination
 *  [data-tilt]        3D tilt + cursor spotlight on hover
 *  [data-spotlight]   cursor spotlight only (no tilt)
 *  [data-parallax]    subtle scroll parallax (value = strength, e.g. 0.12)
 *  [data-index-link]  scroll-spy for the technology page index
 *  [data-header]      scrolled / open state, mobile menu
 *  [data-progress]    scroll progress bar
 *  [data-geomap]      interactive hero canvas (lazy-loaded module)
 */

const reduce = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = () => window.matchMedia('(hover: hover) and (pointer: fine)').matches;

let cleanups: Array<() => void> = [];
const onCleanup = (fn: () => void) => cleanups.push(fn);

/* Reveal --------------------------------------------------------------- */
function initReveal() {
  const els = document.querySelectorAll<HTMLElement>('.reveal:not(.is-in)');
  if (!els.length) return;
  if (!('IntersectionObserver' in window) || reduce()) {
    els.forEach((el) => el.classList.add('is-in'));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          e.target.classList.add('is-in');
          io.unobserve(e.target);
        }
      }
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
  );
  els.forEach((el) => io.observe(el));
  onCleanup(() => io.disconnect());
}

/* Word splitting ------------------------------------------------------- */
function splitWords(root: HTMLElement, className: string) {
  if (root.dataset.splitDone) return;
  root.dataset.splitDone = '1';
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode as Text);
  let i = 0;
  for (const tn of textNodes) {
    const parts = tn.data.split(/(\s+)/);
    if (parts.length === 1 && !parts[0].trim()) continue;
    const frag = document.createDocumentFragment();
    for (const part of parts) {
      if (!part) continue;
      if (/^\s+$/.test(part)) {
        frag.appendChild(document.createTextNode(part));
      } else {
        const span = document.createElement('span');
        span.className = className;
        span.textContent = part;
        span.style.setProperty('--i', String(i++));
        frag.appendChild(span);
      }
    }
    tn.replaceWith(frag);
  }
}

function initSplit() {
  document.querySelectorAll<HTMLElement>('[data-split]').forEach((el) => splitWords(el, 'w'));
}

/* Scroll-linked word illumination ------------------------------------- */
function initWords() {
  const blocks = Array.from(document.querySelectorAll<HTMLElement>('[data-words]'));
  if (!blocks.length) return;
  blocks.forEach((el) => splitWords(el, 'wd'));
  if (reduce()) {
    blocks.forEach((el) => el.querySelectorAll('.wd').forEach((w) => w.classList.add('is-on')));
    return;
  }
  const wordsOf = new Map(blocks.map((b) => [b, Array.from(b.querySelectorAll<HTMLElement>('.wd'))]));
  let ticking = false;
  const update = () => {
    ticking = false;
    const vh = window.innerHeight;
    for (const b of blocks) {
      const r = b.getBoundingClientRect();
      if (r.bottom < 0 || r.top > vh) continue;
      // 0 when the block's top reaches 85% of the viewport, 1 when its bottom reaches 45%.
      const start = vh * 0.85;
      const end = vh * 0.45;
      const p = Math.max(0, Math.min(1, (start - r.top) / (r.height + (start - end))));
      const words = wordsOf.get(b)!;
      const n = Math.round(p * words.length);
      words.forEach((w, i) => w.classList.toggle('is-on', i < n));
    }
  };
  const onScroll = () => {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(update);
    }
  };
  update();
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  onCleanup(() => {
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('resize', onScroll);
  });
}

/* Tilt + spotlight ----------------------------------------------------- */
function initTilt() {
  if (!finePointer() || reduce()) return;
  const els = document.querySelectorAll<HTMLElement>('[data-tilt], [data-spotlight]');
  els.forEach((el) => {
    const tilt = el.hasAttribute('data-tilt');
    const max = parseFloat(el.dataset.tilt || '6') || 6;
    let raf = 0;
    let px = 0.5;
    let py = 0.5;
    const apply = () => {
      raf = 0;
      el.style.setProperty('--mx', `${(px * 100).toFixed(2)}%`);
      el.style.setProperty('--my', `${(py * 100).toFixed(2)}%`);
      if (tilt) {
        el.style.setProperty('--ry', `${((px - 0.5) * 2 * max).toFixed(2)}deg`);
        el.style.setProperty('--rx', `${((0.5 - py) * 2 * max).toFixed(2)}deg`);
      }
    };
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      px = (e.clientX - r.left) / r.width;
      py = (e.clientY - r.top) / r.height;
      if (!raf) raf = requestAnimationFrame(apply);
    };
    const enter = () => el.classList.add('is-hover');
    const leave = () => {
      el.classList.remove('is-hover');
      el.style.setProperty('--rx', '0deg');
      el.style.setProperty('--ry', '0deg');
    };
    el.addEventListener('pointermove', move, { passive: true });
    el.addEventListener('pointerenter', enter);
    el.addEventListener('pointerleave', leave);
    onCleanup(() => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerenter', enter);
      el.removeEventListener('pointerleave', leave);
    });
  });
}

/* Parallax ------------------------------------------------------------- */
function initParallax() {
  const els = Array.from(document.querySelectorAll<HTMLElement>('[data-parallax]'));
  if (!els.length || reduce()) return;
  let ticking = false;
  const update = () => {
    ticking = false;
    const vh = window.innerHeight;
    for (const el of els) {
      const k = parseFloat(el.dataset.parallax || '0.1') || 0.1;
      const r = el.getBoundingClientRect();
      if (r.bottom < -200 || r.top > vh + 200) continue;
      const center = r.top + r.height / 2 - vh / 2;
      el.style.transform = `translate3d(0, ${(-center * k).toFixed(1)}px, 0)`;
    }
  };
  const onScroll = () => {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(update);
    }
  };
  update();
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  onCleanup(() => {
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('resize', onScroll);
    els.forEach((el) => (el.style.transform = ''));
  });
}

/* Header + mobile menu ------------------------------------------------- */
function initHeader() {
  const header = document.querySelector<HTMLElement>('[data-header]');
  const toggle = document.querySelector<HTMLButtonElement>('[data-menu-toggle]');
  const mobileNav = document.getElementById('mobile-nav');
  if (!header) return;

  const setScrolled = () => header.classList.toggle('is-scrolled', window.scrollY > 24);
  setScrolled();
  window.addEventListener('scroll', setScrolled, { passive: true });
  onCleanup(() => window.removeEventListener('scroll', setScrolled));

  const setOpen = (open: boolean) => {
    toggle?.setAttribute('aria-expanded', String(open));
    toggle?.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    if (mobileNav) mobileNav.hidden = !open;
    header.classList.toggle('is-open', open);
    document.body.style.overflow = open ? 'hidden' : '';
  };
  const onToggle = () => setOpen(toggle?.getAttribute('aria-expanded') !== 'true');
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && toggle?.getAttribute('aria-expanded') === 'true') setOpen(false);
  };
  toggle?.addEventListener('click', onToggle);
  document.addEventListener('keydown', onKey);
  onCleanup(() => {
    toggle?.removeEventListener('click', onToggle);
    document.removeEventListener('keydown', onKey);
    document.body.style.overflow = '';
  });
}

/* Scroll progress ------------------------------------------------------ */
function initProgress() {
  const bar = document.querySelector<HTMLElement>('[data-progress]');
  if (!bar) return;
  let ticking = false;
  const update = () => {
    ticking = false;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const p = max > 0 ? window.scrollY / max : 0;
    bar.style.transform = `scaleX(${p.toFixed(4)})`;
  };
  const onScroll = () => {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(update);
    }
  };
  update();
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  onCleanup(() => {
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('resize', onScroll);
  });
}

/* Technology page index scroll-spy ------------------------------------ */
function initScrollSpy() {
  const links = document.querySelectorAll<HTMLAnchorElement>('[data-index-link]');
  const items = document.querySelectorAll<HTMLElement>('[data-index-target]');
  if (!links.length || !items.length) return;
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          links.forEach((l) => l.classList.toggle('is-active', l.dataset.indexLink === e.target.id));
        }
      }
    },
    { rootMargin: '-40% 0px -50% 0px' },
  );
  items.forEach((el) => io.observe(el));
  onCleanup(() => io.disconnect());
}

/* Hero geomap (lazy) --------------------------------------------------- */
function initGeomap() {
  const canvas = document.querySelector<HTMLCanvasElement>('canvas[data-geomap]');
  if (!canvas) return;
  let dispose: (() => void) | undefined;
  let cancelled = false;
  import('./geomap').then(({ initGeomap }) => {
    if (!cancelled) dispose = initGeomap(canvas);
  });
  onCleanup(() => {
    cancelled = true;
    dispose?.();
  });
}

/* Magnetic buttons ----------------------------------------------------- */
function initMagnetic() {
  if (!finePointer() || reduce()) return;
  const els = document.querySelectorAll<HTMLElement>('.btn--primary');
  els.forEach((el) => {
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      el.style.transform = `translate(${(dx * 0.18).toFixed(1)}px, ${(dy * 0.28).toFixed(1)}px)`;
    };
    const leave = () => (el.style.transform = '');
    el.addEventListener('pointermove', move, { passive: true });
    el.addEventListener('pointerleave', leave);
    onCleanup(() => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerleave', leave);
      el.style.transform = '';
    });
  });
}

/* Boot ----------------------------------------------------------------- */
function init() {
  cleanups.forEach((fn) => fn());
  cleanups = [];
  initHeader();
  initProgress();
  initSplit();
  initReveal();
  initWords();
  initTilt();
  initParallax();
  initScrollSpy();
  initMagnetic();
  initGeomap();
}

document.addEventListener('astro:page-load', init);
document.addEventListener('astro:before-swap', () => {
  cleanups.forEach((fn) => fn());
  cleanups = [];
});

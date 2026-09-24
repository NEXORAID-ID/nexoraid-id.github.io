// Independent of the application module: loading always has an escape route.
(() => {
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let paused = motion.matches;
  try { paused ||= sessionStorage.getItem('nexoraid-motion') === 'paused'; } catch { /* Storage is optional. */ }
  if (paused) return;

  const started = performance.now();
  const root = document.documentElement;
  const overlay = document.createElement('div');
  overlay.className = 'page-loader';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Memuat halaman NEXORAID');
  overlay.innerHTML = `<div class="loader-aura" aria-hidden="true"></div>
    <div class="loader-content">
      <div class="loader-emblem" aria-hidden="true"><span class="loader-ring ring-a"></span><span class="loader-ring ring-b"></span><span class="loader-ring ring-c"></span><img src="assets/logo.svg" width="78" height="78" alt=""></div>
      <div class="loader-wordmark" aria-hidden="true">NEXO<span>RAID</span></div>
      <p class="loader-tagline">YOUR NEXT LEVEL IS LOADING</p>
      <div class="loader-track" aria-hidden="true"><span></span></div>
      <p class="loader-status" role="status">Menyiapkan halaman<span class="loader-dots" aria-hidden="true"><i></i><i></i><i></i></span></p>
    </div><button class="loader-skip" type="button">Lewati animasi <span aria-hidden="true">↗</span></button>`;
  document.body.prepend(overlay);
  root.classList.add('page-loading');
  const skip = overlay.querySelector('button');
  let closed = false;
  let readyTimer;
  let removalTimer;
  const failsafe = setTimeout(() => dismiss(true), 4000);

  function remove() { clearTimeout(removalTimer); overlay.remove(); }
  function dismiss(immediate = false) {
    if (closed) { if (immediate) remove(); return; }
    closed = true;
    clearTimeout(failsafe); clearTimeout(readyTimer);
    root.classList.remove('page-loading');
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('load', ready);
    motion.removeEventListener('change', onMotion);
    const restoreFocus = overlay.contains(document.activeElement);
    overlay.setAttribute('aria-hidden', 'true');
    overlay.inert = true;
    if (immediate) remove();
    else {
      overlay.classList.add('is-leaving');
      root.classList.add('page-arrived');
      overlay.addEventListener('transitionend', event => { if (event.target === overlay && event.propertyName === 'opacity') remove(); });
      removalTimer = setTimeout(remove, 600);
    }
    if (restoreFocus) document.querySelector('.brand, .skip-link')?.focus({preventScroll: true});
  }
  function ready() {
    readyTimer = setTimeout(() => dismiss(), Math.max(0, 1050 - (performance.now() - started)));
  }
  function onKey(event) {
    if (event.key === 'Escape') { event.preventDefault(); dismiss(true); }
    if (event.key === 'Tab') { event.preventDefault(); skip.focus({preventScroll: true}); }
  }
  function onMotion() { if (motion.matches) dismiss(true); }
  skip.addEventListener('click', () => dismiss(true));
  document.addEventListener('keydown', onKey);
  motion.addEventListener('change', onMotion);
  // Back/forward cache restores must never revive an overlay or a scroll lock.
  window.addEventListener('pagehide', () => dismiss(true), {once: true});
  window.addEventListener('pageshow', event => { if (event.persisted) dismiss(true); });
  if (document.readyState === 'complete') ready();
  else window.addEventListener('load', ready, {once: true});
})();

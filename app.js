import { CONFIG, services } from './services-data.js';
import { categories, escapeHTML as esc, queryCatalog, orderText, PAGE_SIZE } from './catalog.js';

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const icons = {
  gaming: '<path d="M6 8h12l3 10a2 2 0 0 1-3 2l-4-3h-4l-4 3a2 2 0 0 1-3-2L6 8Z"/><path d="M7 12h4m-2-2v4m7-2h.01M18 14h.01M9 8V5h6"/>',
  accounts: '<rect x="4" y="3" width="16" height="18" rx="3"/><circle cx="12" cy="9" r="2.5"/><path d="M7.5 17c0-4 9-4 9 0"/>',
  software: '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8m-4-4v4M8 9l-2 2 2 2m8-4 2 2-2 2"/>',
  mobile: '<rect x="6" y="2" width="12" height="20" rx="3"/><path d="M10 5h4m-3 14h2"/>',
  seller: '<path d="m3 8 3-5h12l3 5v3a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0V8Zm2 6v7h14v-7M10 21v-5h4v5"/>'
};
function icon(category) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[category] || icons.gaming}</svg>`;
}
function serviceCard(service, index = 0) {
  return `<article class="service-card reveal" style="--delay:${index % 3 * 60}ms">
    <div class="service-top"><div class="service-icon">${icon(service.category)}</div><span class="service-badge">${esc(categories[service.category])}</span></div>
    <h3><a href="detail.html?id=${encodeURIComponent(service.id)}">${esc(service.name)}</a></h3><p>${esc(service.desc)}</p>
    <div class="service-price"><small>${service.price === 'Sesuai Request' ? 'Harga sesuai kebutuhan' : 'Harga layanan'}</small><strong>${esc(service.price)}</strong></div>
    <div class="service-actions"><a class="text-link" href="detail.html?id=${encodeURIComponent(service.id)}" aria-label="Lihat detail ${esc(service.name)}">Lihat detail ↗</a><a class="btn btn-primary btn-sm" href="${CONFIG.discordUrl}" target="_blank" rel="noopener noreferrer" aria-label="Order ${esc(service.name)} via Discord">Order ↗</a></div></article>`;
}

// Progressive enhancement: content remains visible without JavaScript.
const observer = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
  entries.forEach(entry => { if (entry.isIntersecting) { entry.target.classList.add('is-visible'); observer.unobserve(entry.target); } });
}, { threshold: 0.06 }) : null;
function reveal() {
  $$('.reveal:not(.is-visible)').forEach(element => {
    if (reducedMotion.matches || !observer) element.classList.add('is-visible');
    else { element.classList.add('will-reveal'); observer.observe(element); }
  });
}
$$('[data-discord-link]').forEach(link => { link.href = CONFIG.discordUrl; link.target = '_blank'; link.rel = 'noopener noreferrer'; });
$$('[data-icon]').forEach(element => { element.innerHTML = icon(element.dataset.icon); });
$$('[data-year]').forEach(element => { element.textContent = new Date().getFullYear(); });

const menuButton = $('#navToggle'), menu = $('#navMenu');
function closeMenu() { menu?.classList.remove('open'); menuButton?.setAttribute('aria-expanded', 'false'); menuButton?.setAttribute('aria-label', 'Buka menu'); }
menuButton?.addEventListener('click', () => {
  const open = menu.classList.toggle('open');
  menuButton.setAttribute('aria-expanded', String(open)); menuButton.setAttribute('aria-label', open ? 'Tutup menu' : 'Buka menu');
});
menu?.querySelectorAll('a').forEach(link => link.addEventListener('click', closeMenu));
document.addEventListener('click', event => { if (!event.target.closest('.site-header')) closeMenu(); });
document.addEventListener('keydown', event => { if (event.key === 'Escape' && menu?.classList.contains('open')) { closeMenu(); menuButton.focus(); } });
matchMedia('(min-width: 901px)').addEventListener('change', closeMenu);

const motionButton = $('#motionToggle');
let motionPaused = false;
try { motionPaused = sessionStorage.getItem('nexoraid-motion') === 'paused'; } catch { /* Optional storage. */ }
function updateMotion() {
  document.documentElement.classList.toggle('motion-paused', motionPaused || reducedMotion.matches);
  motionButton?.setAttribute('aria-pressed', String(motionPaused || reducedMotion.matches));
  if (motionButton) motionButton.textContent = motionPaused || reducedMotion.matches ? 'Animasi: nonaktif' : 'Jeda animasi';
}
motionButton?.addEventListener('click', () => {
  motionPaused = !motionPaused;
  try { sessionStorage.setItem('nexoraid-motion', motionPaused ? 'paused' : 'active'); } catch { /* Optional storage. */ }
  updateMotion();
});
reducedMotion.addEventListener('change', updateMotion); updateMotion();

// Decorative motion stays outside the layout and never captures clicks.
const heroArt = $('.hero-art');
if (heroArt) {
  heroArt.insertAdjacentHTML('beforeend', '<div class="hero-orbit orbit-one"></div><div class="hero-orbit orbit-two"></div><div class="hero-orbit orbit-three"></div><div class="hero-particles">' + Array.from({length: 12}, (_, index) => `<span style="--i:${index};--x:${12 + (index * 23) % 78}%;--y:${10 + (index * 31) % 80}%;--duration:${3 + index % 5}s"></span>`).join('') + '</div>');
}
const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
let tiltFrame = 0;
let hoveredCard = null;
document.addEventListener('pointermove', event => {
  if (!finePointer.matches || reducedMotion.matches || motionPaused) return;
  const card = event.target.closest('.service-card');
  if (hoveredCard && hoveredCard !== card) { hoveredCard.style.removeProperty('--tilt-x'); hoveredCard.style.removeProperty('--tilt-y'); }
  hoveredCard = card;
  if (!card || tiltFrame) return;
  const {clientX, clientY} = event;
  tiltFrame = requestAnimationFrame(() => {
    const bounds = card.getBoundingClientRect();
    const x = (clientX - bounds.left) / bounds.width;
    const y = (clientY - bounds.top) / bounds.height;
    card.style.setProperty('--tilt-x', `${(0.5 - y) * 7}deg`);
    card.style.setProperty('--tilt-y', `${(x - 0.5) * 7}deg`);
    card.style.setProperty('--shine-x', `${x * 100}%`);
    card.style.setProperty('--shine-y', `${y * 100}%`);
    tiltFrame = 0;
  });
}, {passive: true});

let scrollScheduled = false;
function updateScroll() {
  const max = document.documentElement.scrollHeight - innerHeight;
  $('#scrollProgress')?.style.setProperty('transform', `scaleX(${max > 0 ? scrollY / max : 0})`);
  $('.site-header')?.classList.toggle('scrolled', scrollY > 12);
  $('#backToTop')?.classList.toggle('visible', scrollY > 600); scrollScheduled = false;
}
window.addEventListener('scroll', () => { if (!scrollScheduled) { requestAnimationFrame(updateScroll); scrollScheduled = true; } }, { passive: true });
updateScroll();
$('#backToTop')?.addEventListener('click', () => { window.scrollTo({ top: 0, behavior: reducedMotion.matches || motionPaused ? 'instant' : 'smooth' }); $('.brand')?.focus({ preventScroll: true }); });
if ($('#featuredServices')) $('#featuredServices').innerHTML = ['gta-nexo-spark', 'akun-game-random', 'windows-license'].map(id => services.find(s => s.id === id)).map(serviceCard).join('');

const grid = $('#serviceGrid');
if (grid) {
  const search = $('#serviceSearch'), sort = $('#serviceSort');
  let category = 'all', page = 1, searchTimer;
  function readURL() {
    const params = new URLSearchParams(location.search);
    category = Object.hasOwn(categories, params.get('category')) ? params.get('category') : 'all';
    search.value = (params.get('q') || '').slice(0, 160);
    sort.value = ['recommended', 'name', 'price-asc', 'price-desc'].includes(params.get('sort')) ? params.get('sort') : 'recommended';
    page = Number.parseInt(params.get('page'), 10) || 1;
  }
  function render(mode = 'replace', moveFocus = false) {
    const result = queryCatalog(services, { category, query: search.value, sort: sort.value, page }); page = result.currentPage;
    const params = new URLSearchParams();
    if (category !== 'all') params.set('category', category);
    if (search.value.trim()) params.set('q', search.value.trim());
    if (sort.value !== 'recommended') params.set('sort', sort.value);
    if (page > 1) params.set('page', page);
    if (mode !== 'none') history[mode === 'push' ? 'pushState' : 'replaceState'](null, '', location.pathname + (params.size ? '?' + params : ''));
    $$('[data-filter]').forEach(button => { const active = button.dataset.filter === category; button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active)); });
    $('#resultCount').textContent = result.total ? `${result.total} layanan · Menampilkan ${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, result.total)}` : '0 layanan ditemukan';
    grid.innerHTML = result.rows.map(serviceCard).join(''); $('#emptyState').hidden = result.total !== 0;
    $('#pagination').innerHTML = result.totalPages > 1 ? Array.from({ length: result.totalPages }, (_, i) => `<button type="button" class="page-button ${page === i + 1 ? 'active' : ''}" data-page="${i + 1}" ${page === i + 1 ? 'aria-current="page"' : ''} aria-label="Halaman ${i + 1}">${i + 1}</button>`).join('') : '';
    $('#clearSearch').hidden = !search.value; reveal();
    if (moveFocus) { $('#resultCount').focus({ preventScroll: true }); $('#catalogControls').scrollIntoView({ behavior: reducedMotion.matches ? 'instant' : 'smooth', block: 'start' }); }
  }
  search.addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => { page = 1; render(); }, 150); });
  $('#catalogSearchForm').addEventListener('submit', event => { event.preventDefault(); clearTimeout(searchTimer); page = 1; render('push'); });
  sort.addEventListener('change', () => { page = 1; render('push'); });
  $$('[data-filter]').forEach(button => button.addEventListener('click', () => { category = button.dataset.filter; page = 1; render('push'); }));
  $('#clearSearch').addEventListener('click', () => { search.value = ''; page = 1; render(); search.focus(); });
  $('#resetFilters').addEventListener('click', () => { search.value = ''; sort.value = 'recommended'; category = 'all'; page = 1; render('push'); search.focus(); });
  $('#pagination').addEventListener('click', event => { const button = event.target.closest('[data-page]'); if (button) { page = Number(button.dataset.page); render('push', true); } });
  window.addEventListener('popstate', () => { clearTimeout(searchTimer); readURL(); render('none'); });
  readURL(); render();
}

let toastTimer;
async function copyText(text, label) {
  try {
    await navigator.clipboard.writeText(text);
    const toast = $('#toast'); toast.textContent = label; toast.classList.add('visible');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('visible'), 4000);
  } catch {
    $('#copyFallback').value = text; $('#copyDialog').showModal(); $('#copyFallback').focus(); $('#copyFallback').select();
  }
}
$('#closeCopyDialog')?.addEventListener('click', () => $('#copyDialog').close());
const detail = $('#detailContent');
if (detail) {
  const service = services.find(item => item.id === new URLSearchParams(location.search).get('id'));
  if (!service) {
    detail.innerHTML = '<div class="empty-state"><span class="empty-symbol">↗</span><h1>Layanan tidak ditemukan.</h1><p>Tautan mungkin tidak lengkap. Temukan layananmu di katalog.</p><a class="btn btn-primary" href="layanan.html">Buka katalog ↗</a></div>';
    document.title = 'Layanan tidak ditemukan — NEXORAID';
  } else {
    document.title = `${service.name} — NEXORAID`;
    $('meta[name="description"]').content = `${service.desc} Harga: ${service.price}. Order melalui Discord Ticket NEXORAID.`;
    const serviceURL = new URL(`detail.html?id=${encodeURIComponent(service.id)}`, location.href).href;
    const related = services.filter(item => item.category === service.category && item.id !== service.id).slice(0, 3);
    const suggestions = related.length ? related : services.filter(item => item.id !== service.id).slice(0, 3);
    detail.innerHTML = `<nav class="breadcrumbs" aria-label="Breadcrumb"><a href="index.html">Beranda</a><span>/</span><a href="layanan.html?category=${service.category}">${esc(categories[service.category])}</a><span>/</span><span aria-current="page">${esc(service.name)}</span></nav>
      <div class="detail-layout"><div class="detail-main"><span class="category-label">${esc(categories[service.category])}</span><h1>${esc(service.name)}</h1><p class="lead">${esc(service.desc)}</p>
      <section class="detail-spec"><h2>Detail layanan</h2><dl class="spec-list">${service.details.map(([key, value]) => `<div><dt>${esc(key)}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl></section></div>
      <aside class="order-panel"><span class="kicker">PILIH. KONFIRMASI. UPGRADE.</span><h2>Siap mulai?</h2><span class="muted">Harga katalog</span><strong class="order-price">${esc(service.price)}</strong><p>Kirim pilihanmu lewat Discord. Admin akan mengonfirmasi detail dan harga sebelum pembayaran.</p>
      <a class="btn btn-primary btn-block" href="${CONFIG.discordUrl}" target="_blank" rel="noopener noreferrer">Order via Discord ↗</a><button type="button" class="btn btn-ghost btn-block" id="copyOrder">Salin format pesanan</button><button type="button" class="text-link share-link" id="copyServiceLink">Salin tautan layanan ↗</button>
      <div class="order-note">Stok, pilihan paket, dan estimasi proses dikonfirmasi oleh admin melalui tiket.</div><a class="text-link" href="cara-order.html">Lihat cara order →</a></aside></div>
      <section class="related-section"><div class="section-head"><h2>${related.length ? 'Layanan terkait.' : 'Layanan lainnya.'}</h2><a class="text-link" href="layanan.html?category=${service.category}">Lihat kategori ↗</a></div><div class="service-grid">${suggestions.map(serviceCard).join('')}</div></section>`;
    $('#copyOrder').addEventListener('click', () => copyText(orderText(service, serviceURL), 'Format pesanan disalin. Tempelkan di tiket Discord.'));
    $('#copyServiceLink').addEventListener('click', () => copyText(serviceURL, 'Tautan layanan disalin.'));
  }
}
$('#faqSearch')?.addEventListener('input', () => {
  const query = $('#faqSearch').value.trim().toLocaleLowerCase('id'); let count = 0;
  $$('.faq-item').forEach(row => { row.hidden = !row.textContent.toLocaleLowerCase('id').includes(query); if (!row.hidden) count++; });
  $('#faqEmpty').hidden = count !== 0; $('#faqCount').textContent = `${count} pertanyaan`;
});
reveal();

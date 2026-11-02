import { CONFIG, services } from './services-data.js';
import { categories, escapeHTML as esc, queryCatalog, orderText, fixedPriceValue, comparisonTotals, PAGE_SIZE } from './catalog.js';

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
function serviceCard(service, index = 0, compareEnabled = false) {
  return `<article class="service-card reveal" style="--delay:${index % 3 * 60}ms">
    <div class="service-top"><div class="service-icon">${icon(service.category)}</div><span class="service-badge">${esc(categories[service.category])}</span></div>
    <h3><a href="detail.html?id=${encodeURIComponent(service.id)}">${esc(service.name)}</a></h3><p>${esc(service.desc)}</p>
    <div class="service-price"><small>${service.price === 'Sesuai Request' ? 'Harga sesuai kebutuhan' : 'Harga layanan'}</small><strong>${esc(service.price)}</strong></div>
    <div class="service-actions"><a class="text-link" href="detail.html?id=${encodeURIComponent(service.id)}" aria-label="Lihat detail ${esc(service.name)}">Lihat detail ↗</a><a class="btn btn-primary btn-sm" href="${CONFIG.discordUrl}" target="_blank" rel="noopener noreferrer" aria-label="Order ${esc(service.name)} via Discord">Order ↗</a></div>
    ${compareEnabled ? `<button type="button" class="compare-add" data-compare="${esc(service.id)}" aria-pressed="false">+ Bandingkan</button>` : ''}</article>`;
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
const homeProof = $('.hero-proof');
if (homeProof) {
  homeProof.querySelector('span').textContent = `${services.length} layanan di katalog`;
  homeProof.insertAdjacentHTML('afterend', `<form class="terminal-search" id="homeSearch" action="layanan.html" method="get" role="search">
    <label for="homeSearchInput"><span class="terminal-prompt">nexo@catalog:~$</span> search --services</label>
    <div class="terminal-search-box"><span class="terminal-search-symbol" aria-hidden="true">&gt;</span><input id="homeSearchInput" name="q" type="search" placeholder="Cari GTA, Windows, akun game..." autocomplete="off" aria-controls="homeSearchResults" aria-expanded="false" aria-label="Cari layanan"><kbd aria-hidden="true">CTRL K</kbd><button type="submit">CARI ↵</button></div>
    <div class="terminal-results" id="homeSearchResults" role="listbox" aria-label="Hasil pencarian" hidden></div>
    <p class="terminal-hint"><strong>TIP:</strong><span>ketik untuk melihat hasil cepat · tekan / atau Ctrl K untuk mencari</span></p>
  </form>`);
}
const ticker = $('.ticker');
if (ticker) {
  const directoryIds = Object.keys(categories).filter(category => category !== 'all');
  const directoryLabels = {gaming: 'Gaming', accounts: 'Akun Game', software: 'Software', mobile: 'Mobile', seller: 'Seller'};
  const directoryLinks = directoryIds.map((category, index) => {
    const count = services.filter(service => service.category === category).length;
    return `<a class="directory-card" href="layanan.html?category=${encodeURIComponent(category)}"><span class="directory-index">${String(index + 1).padStart(2, '0')}</span><span class="directory-copy"><strong>${esc(directoryLabels[category])}</strong><small>${String(count).padStart(2, '0')} ITEMS // OPEN</small></span><span class="directory-arrow" aria-hidden="true">↗</span></a>`;
  }).join('');
  ticker.insertAdjacentHTML('afterend', `<section class="command-center reveal" aria-labelledby="commandCenterTitle"><div class="container">
    <div class="command-center-head"><div><span class="kicker">NEXO://DIRECTORY</span><h2 id="commandCenterTitle">Pilih direktori.</h2></div><p>SELECT TARGET // BROWSE CATALOG</p></div>
    <div class="directory-grid">${directoryLinks}</div>
    <div class="system-strip"><span class="system-online">SYSTEM ONLINE</span><span>CATALOG <b>${services.length}</b> ITEMS</span><span>CHANNELS <b>${directoryIds.length}</b></span><span>SUPPORT VIA DISCORD TICKET</span></div>
  </div></section>`);
  const showcaseIds = ['gta-nexo-spark', 'akun-game-premium', 'windows-license', 'custom-rom'];
  const showcaseCards = showcaseIds.map(id => services.find(service => service.id === id)).filter(Boolean).map(service => `<a class="showcase-card" href="detail.html?id=${encodeURIComponent(service.id)}">
    <span class="showcase-visual showcase-visual--${esc(service.category)}" aria-hidden="true"><span class="showcase-gridlines"></span><span class="showcase-index">NEXO / ${esc(service.category.toUpperCase())}</span><span class="showcase-icon">${icon(service.category)}</span><span class="showcase-scan"></span></span>
    <span class="showcase-info"><span class="showcase-category">${esc(categories[service.category])} // PREVIEW</span><strong>${esc(service.name)}</strong><span class="showcase-price">${esc(service.price)}</span></span><span class="showcase-open" aria-hidden="true">↗</span>
  </a>`).join('');
  ticker.nextElementSibling.insertAdjacentHTML('afterend', `<section class="showcase-section" id="showcaseSection" aria-labelledby="showcaseTitle"><div class="container">
    <div class="showcase-heading"><div><span class="kicker">NEXO://SHOWCASE</span><h2 id="showcaseTitle">Lihat pilihan unggulan.</h2></div><a class="text-link" href="layanan.html">Jelajahi katalog ↗</a></div>
    <div class="showcase-grid">${showcaseCards}</div>
    <p class="showcase-disclaimer">Visual ilustrasi untuk preview kategori, bukan foto bukti pengerjaan. Detail dan ketersediaan mengikuti halaman layanan.</p>
  </div></section>`);
  $('#showcaseSection').insertAdjacentHTML('afterend', `<section class="live-terminal-section" aria-labelledby="liveTerminalTitle"><div class="container">
    <div class="live-terminal-heading"><div><span class="kicker">NEXO://LOCAL-FEED</span><h2 id="liveTerminalTitle">Live terminal logs.</h2></div><button type="button" class="terminal-feed-toggle" id="terminalFeedToggle" aria-pressed="false">Pause feed</button></div>
    <div class="live-terminal" id="liveTerminal">
      <div class="live-terminal-bar"><span class="terminal-lights" aria-hidden="true"><i></i><i></i><i></i></span><span>nexoraid@browser:~ / activity.log</span><span class="terminal-local-status"><i></i>LOCAL FEED</span></div>
      <ol class="terminal-log-list" id="terminalLogList" role="log" aria-label="Log aktivitas antarmuka lokal" aria-live="off"></ol>
      <div class="terminal-prompt-line" aria-hidden="true"><span>nexo@local:~$</span><i></i></div>
    </div>
    <p class="terminal-disclaimer">Log ini mencatat status antarmuka dan aktivitas lokal di browser ini saja. Tidak menampilkan order, pembayaran, stok, atau status server live.</p>
  </div></section>`);
  const terminalLogList = $('#terminalLogList');
  const terminalFeedToggle = $('#terminalFeedToggle');
  const terminalClock = new Intl.DateTimeFormat('id-ID', {hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false});
  const terminalStartedAt = performance.now();
  let terminalSequence = 0;
  const terminalEvents = [
    ['HEARTBEAT', 'Browser UI aktif · sesi lokal berjalan'],
    ['CATALOG', `${services.length} entri katalog tersedia dari data lokal`],
    ['TELEMETRY', 'Order, pembayaran, dan status server tidak terhubung']
  ];
  function appendTerminalLog(type, message) {
    const row = document.createElement('li');
    const time = document.createElement('time');
    const marker = document.createElement('span');
    const text = document.createElement('span');
    time.dateTime = new Date().toISOString();
    time.textContent = terminalClock.format(new Date());
    marker.className = 'terminal-log-type';
    marker.textContent = type;
    text.className = 'terminal-log-message';
    text.textContent = message;
    row.append(time, marker, text);
    terminalLogList.append(row);
    while (terminalLogList.children.length > 6) terminalLogList.firstElementChild.remove();
    terminalLogList.scrollTop = terminalLogList.scrollHeight;
  }
  [
    ['BOOT', 'Antarmuka browser berhasil diinisialisasi'],
    ['CATALOG', `${services.length} entri katalog dimuat dari bundle lokal`],
    ['SOURCE', 'Feed hanya untuk UI lokal · tidak ada telemetri order'],
    ['READY', 'Menunggu interaksi di halaman']
  ].forEach(([type, message]) => appendTerminalLog(type, message));
  let terminalEventIndex = 0;
  window.setInterval(() => {
    if (document.hidden || document.documentElement.classList.contains('motion-paused') || terminalFeedToggle.getAttribute('aria-pressed') === 'true') return;
    const [type, message] = terminalEvents[terminalEventIndex % terminalEvents.length];
    terminalEventIndex += 1;
    if (type === 'HEARTBEAT') {
      const elapsedSeconds = Math.floor((performance.now() - terminalStartedAt) / 1000);
      appendTerminalLog(type, `${message} · ${elapsedSeconds} dtk`);
    } else appendTerminalLog(type, message);
  }, 3200);
  terminalFeedToggle.addEventListener('click', () => {
    const paused = terminalFeedToggle.getAttribute('aria-pressed') !== 'true';
    terminalFeedToggle.setAttribute('aria-pressed', String(paused));
    terminalFeedToggle.textContent = paused ? 'Resume feed' : 'Pause feed';
    if (!paused) appendTerminalLog('FEED', 'Pembaruan feed lokal dilanjutkan');
  });
  $('#homeSearch')?.addEventListener('submit', () => appendTerminalLog('SEARCH', 'Pencarian katalog lokal diminta'));
  $('#homeSearchResults')?.addEventListener('click', event => {
    if (event.target.closest('[data-suggestion]')) appendTerminalLog('ROUTE', 'Pilihan layanan lokal dibuka');
  });
  reveal();
}
const homeSearchInput = $('#homeSearchInput');
const homeSearchResults = $('#homeSearchResults');
function renderHomeSuggestions() {
  if (!homeSearchInput || !homeSearchResults) return;
  const query = homeSearchInput.value.trim();
  if (!query) {
    homeSearchResults.hidden = true;
    homeSearchInput.setAttribute('aria-expanded', 'false');
    homeSearchResults.replaceChildren();
    return;
  }
  const matches = queryCatalog(services, {query}).rows.slice(0, 5);
  homeSearchResults.innerHTML = matches.length
    ? matches.map(service => `<a role="option" data-suggestion href="detail.html?id=${encodeURIComponent(service.id)}"><span class="terminal-result-name">${esc(service.name)}<span class="sr-only"> — ${esc(categories[service.category])}</span></span><span class="terminal-result-meta">${esc(service.price)}</span></a>`).join('')
    : '<div class="terminal-empty" role="status">NO MATCH // Coba kata kunci lain.</div>';
  homeSearchResults.hidden = false;
  homeSearchInput.setAttribute('aria-expanded', 'true');
}
homeSearchInput?.addEventListener('input', renderHomeSuggestions);
homeSearchInput?.addEventListener('keydown', event => {
  if (event.key === 'ArrowDown' && !homeSearchResults.hidden) {
    const firstSuggestion = homeSearchResults.querySelector('[data-suggestion]');
    if (firstSuggestion) { event.preventDefault(); firstSuggestion.focus(); }
  }
  if (event.key === 'Escape') {
    homeSearchResults.hidden = true;
    homeSearchInput.setAttribute('aria-expanded', 'false');
  }
});
homeSearchResults?.addEventListener('keydown', event => {
  const suggestions = [...homeSearchResults.querySelectorAll('[data-suggestion]')];
  if (event.key === 'Escape') {
    homeSearchResults.hidden = true;
    homeSearchInput?.setAttribute('aria-expanded', 'false');
    homeSearchInput?.focus();
    return;
  }
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
  const current = suggestions.indexOf(document.activeElement);
  const next = event.key === 'ArrowDown'
    ? Math.min(current + 1, suggestions.length - 1)
    : current <= 0 ? -1 : current - 1;
  event.preventDefault();
  if (next < 0) homeSearchInput?.focus();
  else suggestions[next].focus();
});
document.addEventListener('keydown', event => {
  if (document.querySelector('.page-loader')) return;
  const target = event.target;
  const isEditing = target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
  if ((event.key === '/' && !isEditing) || ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k')) {
    if (!homeSearchInput) return;
    event.preventDefault();
    homeSearchInput.focus();
    homeSearchInput.select();
  }
});
document.addEventListener('click', event => {
  if (homeSearchInput && !event.target.closest('#homeSearch')) {
    homeSearchResults.hidden = true;
    homeSearchInput.setAttribute('aria-expanded', 'false');
  }
});
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
  const compareSelection = new Map();
  const comparePanel = $('#comparePanel');
  const compareTable = $('#compareTable');
  const compareSummary = $('#compareSummary');
  function renderComparison() {
    const selected = [...compareSelection.values()];
    comparePanel.hidden = selected.length === 0;
    grid.querySelectorAll('[data-compare]').forEach(button => {
      const active = compareSelection.has(button.dataset.compare);
      button.setAttribute('aria-pressed', String(active));
      button.textContent = active ? '✓ Ditambahkan' : '+ Bandingkan';
    });
    if (!selected.length) return;
    compareTable.innerHTML = `<caption class="sr-only">Perbandingan layanan yang dipilih</caption>
      <thead><tr><th scope="col">RINGKASAN</th>${selected.map(service => `<th scope="col"><a href="detail.html?id=${encodeURIComponent(service.id)}">${esc(service.name)} ↗</a><button type="button" class="compare-remove" data-remove-compare="${esc(service.id)}" aria-label="Hapus ${esc(service.name)} dari perbandingan">×</button></th>`).join('')}</tr></thead>
      <tbody><tr><th scope="row">Kategori</th>${selected.map(service => `<td>${esc(categories[service.category])}</td>`).join('')}</tr>
      <tr><th scope="row">Harga katalog</th>${selected.map(service => `<td class="compare-price">${esc(service.price)}</td>`).join('')}</tr>
      <tr><th scope="row">Ringkasan</th>${selected.map(service => `<td>${esc(service.desc)}</td>`).join('')}</tr></tbody>`;
    const {knownTotal, needsQuote} = comparisonTotals(selected);
    const formattedTotal = new Intl.NumberFormat('id-ID', {style: 'currency', currency: 'IDR', maximumFractionDigits: 0}).format(knownTotal);
    const totalLabel = knownTotal ? `Subtotal indikatif harga pasti: ${formattedTotal}` : 'Belum ada harga pasti untuk dijumlahkan';
    compareSummary.innerHTML = `<strong>${totalLabel}</strong><span>${needsQuote ? `${needsQuote} pilihan perlu harga dari admin. ` : ''}Jumlah ini hanya menjumlahkan harga katalog yang pasti; stok, kecocokan layanan, dan harga final tetap dikonfirmasi melalui tiket.</span>`;
  }
  grid.addEventListener('click', event => {
    const button = event.target.closest('[data-compare]');
    if (!button) return;
    const service = services.find(item => item.id === button.dataset.compare);
    if (!service) return;
    if (compareSelection.has(service.id)) compareSelection.delete(service.id);
    else if (compareSelection.size >= 3) {
      showToast('Maksimal 3 layanan bisa dibandingkan. Hapus salah satu pilihan dahulu.');
      return;
    } else compareSelection.set(service.id, service);
    renderComparison();
  });
  compareTable.addEventListener('click', event => {
    const button = event.target.closest('[data-remove-compare]');
    if (!button) return;
    compareSelection.delete(button.dataset.removeCompare);
    renderComparison();
  });
  $('#clearCompare')?.addEventListener('click', () => {
    compareSelection.clear();
    renderComparison();
  });
  $('#copyCompare')?.addEventListener('click', () => {
    const selected = [...compareSelection.values()];
    if (!selected.length) return;
    const items = selected.map(service => `- ${service.name}: ${service.price}`).join('\n');
    const {knownTotal: subtotal, needsQuote: variableCount} = comparisonTotals(selected);
    const totalLine = subtotal ? `Subtotal indikatif harga pasti: Rp${new Intl.NumberFormat('id-ID').format(subtotal)}${variableCount ? ` (belum termasuk ${variableCount} layanan yang perlu penawaran)` : ''}` : 'Subtotal: menunggu konfirmasi harga dari admin.';
    copyText(`Halo admin NEXORAID!\n\nSaya ingin konsultasi pilihan layanan:\n${items}\n\n${totalLine}\nMohon cek stok, kecocokan layanan, dan harga final sebelum pembayaran. Terima kasih!`, 'Ringkasan pilihan disalin. Tempelkan di tiket Discord.');
  });
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
    grid.innerHTML = result.rows.map((service, index) => serviceCard(service, index, true)).join(''); $('#emptyState').hidden = result.total !== 0; renderComparison();
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
function showToast(label) {
  const toast = $('#toast');
  if (!toast) return;
  toast.textContent = label;
  toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('visible'), 4000);
}
async function copyText(text, label) {
  try {
    await navigator.clipboard.writeText(text);
    showToast(label);
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

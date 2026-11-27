import { CONFIG, services as baselineServices } from './services-data.js';
import { getLiveCatalog } from './live-catalog.js';
import { categories, escapeHTML as esc, queryCatalog, orderText, fixedPriceValue, comparisonTotals, PAGE_SIZE, safeSelection, savedBasket, basketTotals, basketText, packageOptions, pricingInfo, priceCSV, effectiveCatalogUnit, activePromotions, rentalStockBlocked as stockBlocked, basketHasUnavailable, MARKETPLACE_ORIGIN, marketplaceAccountOrigin, marketplaceAccountState } from './catalog.js';

const catalogue=await getLiveCatalog(baselineServices,location);
const services=catalogue.services;
const stockLabel=s=>s.availability==='sold_out'?'Stok habis':s.availability==='unconfigured'?'Stok belum dikonfirmasi':s.availability==='available'?'Stok tersedia saat diperiksa':'';
if(catalogue.production){const notice=document.createElement('p');notice.className='catalog-source-notice';notice.textContent=catalogue.live?'Katalog aktif terhubung ke NEXORAID V4. Harga akhir mengikuti tagihan portal.':'Katalog cadangan: harga dan ketersediaan belum tersinkron. Konfirmasi melalui portal sebelum membayar.';document.querySelector('main')?.prepend(notice);}
const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const money = amount => 'Rp'+amount.toLocaleString('id-ID');
// Generated static detail pages exist only in the validated build artifact.
const builtSite = document.querySelector('meta[name="nexoraid-build"]') !== null;
const serviceHref = id => builtSite ? 'layanan-'+encodeURIComponent(id)+'.html' : 'detail.html?id='+encodeURIComponent(id);
function readStore(key, fallback) { try {return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback;} catch {return fallback;} }
function saveStore(key, value) { try {localStorage.setItem(key,JSON.stringify(value));return true;} catch {return false;} }
let favorites = safeSelection(readStore('nexoraid-favorites',[]), services);
let basket = savedBasket(readStore('nexoraid-basket',[]), services);
const basketNav=$('#basketNav');
function updateBasketNav(){if(basketNav)basketNav.textContent='Keranjang ('+basket.reduce((n,r)=>n+r.quantity,0)+')';}
function updateFavorites(){ $$('[data-favorite]').forEach(b=>{const selected=favorites.includes(b.dataset.favorite);b.setAttribute('aria-pressed',String(selected));b.textContent=selected?'♥ Tersimpan':'♡ Favorit';}); }
function addBasket(id,quantity=1){if(!services.some(s=>s.id===id&&s.orderable!==false&&!stockBlocked(s))||!Number.isInteger(quantity)||quantity<1||quantity>99)return;const row=basket.find(s=>s.id===id);if(row){if(row.quantity+quantity>99){showToast('Jumlah maksimal 99.');return;}row.quantity+=quantity;}else{if(basket.length>=50){showToast('Keranjang sudah penuh.');return;}basket.push({id,quantity});}const saved=saveStore('nexoraid-basket',basket);updateBasketNav();renderBasket();showToast(saved?'Ditambahkan ke keranjang.':'Ditambahkan untuk sesi halaman ini; penyimpanan browser tidak tersedia.');}
updateBasketNav();
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
    <h3><a href="${serviceHref(service.id)}">${esc(service.name)}</a></h3><p>${esc(service.desc)}</p>
    <div class="service-price"><small>${service.price === 'Sesuai Request' ? 'Harga sesuai kebutuhan' : 'Harga layanan'}</small><strong>${esc(service.price)}</strong>${stockLabel(service)?`<small>${esc(stockLabel(service))}</small>`:''}</div>
    <div class="service-actions"><a class="text-link" href="${serviceHref(service.id)}" aria-label="Lihat detail ${esc(service.name)}">Lihat detail ↗</a>${service.orderable===false||stockBlocked(service)?'':`<a class="btn btn-primary btn-sm" href="${serviceHref(service.id)}#pesan" aria-label="Pesan ${esc(service.name)}">Pesan ↗</a>`}</div>
    <div class="card-tools"><button type="button" class="compare-add" data-favorite="${esc(service.id)}" aria-pressed="${favorites.includes(service.id)}">${favorites.includes(service.id)?'♥ Tersimpan':'♡ Favorit'}</button>${service.orderable===false||stockBlocked(service)?'':`<button type="button" class="compare-add" data-basket="${esc(service.id)}">+ Keranjang</button>`}</div>${compareEnabled ? `<button type="button" class="compare-add" data-compare="${esc(service.id)}" aria-pressed="false">+ Bandingkan</button>` : ''}</article>`;
}

// Progressive enhancement: content remains visible without JavaScript.
const observer = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
  entries.forEach(entry => { if (entry.isIntersecting) { entry.target.classList.add('is-visible'); observer.unobserve(entry.target); } });
}, { threshold: 0.06 }) : null;
function reveal() {
  $$('.reveal:not(.is-visible)').forEach(element => {
    if (reducedMotion.matches || motionPaused || !observer) element.classList.add('is-visible');
    else { element.classList.add('will-reveal'); observer.observe(element); }
  });
}
$$('[data-discord-link]').forEach(link => { link.href = CONFIG.discordUrl; link.target = '_blank'; link.rel = 'noopener noreferrer'; });
$$('[data-icon]').forEach(element => { element.innerHTML = icon(element.dataset.icon); });
$$('[data-year]').forEach(element => { element.textContent = new Date().getFullYear(); });

// Route generic ticket CTAs through the access instructions; preserve the actual channel on contact page.
if(!location.pathname.endsWith('/kontak.html')) $$('[data-discord-link]').forEach(link=>{link.href='kontak.html';link.removeAttribute('target');link.removeAttribute('rel');});
const menuButton = $('#navToggle'), menu = $('#navMenu');
if(menuButton && menu) document.documentElement.classList.add('nav-ready');
function closeMenu() { menu?.classList.remove('open'); menuButton?.setAttribute('aria-expanded', 'false'); menuButton?.setAttribute('aria-label', 'Buka menu'); }
menuButton?.addEventListener('click', () => {
  const open = menu.classList.toggle('open');
  menuButton.setAttribute('aria-expanded', String(open)); menuButton.setAttribute('aria-label', open ? 'Tutup menu' : 'Buka menu');
});
menu?.querySelectorAll('a').forEach(link => link.addEventListener('click', closeMenu));
document.addEventListener('click', event => { if (!event.target.closest('.site-header')) closeMenu(); });
document.addEventListener('keydown', event => { if (event.key === 'Escape' && menu?.classList.contains('open')) { closeMenu(); menuButton.focus(); } });
matchMedia('(min-width: 901px)').addEventListener('change', closeMenu);
// Shared storefront header: cookies remain HttpOnly and same-origin; no cached identity or cross-origin credential requests.
function setupMarketplaceAccount(){
 if(!menu)return;
 const portalURL=MARKETPLACE_ORIGIN+'/portal.html';
 let link=$('#accountNav');if(!link){link=document.createElement('a');link.id='accountNav';link.className='btn btn-primary';menu.append(link);}
 link.href=portalURL;link.textContent='Masuk / Dasbor';
 const sameOrigin=marketplaceAccountOrigin(location.origin);
 // The legacy Pages site cannot read the Worker's host-only session.
 // Route customers to the real portal rather than force another OAuth login.
 if(!sameOrigin)return;
 document.querySelectorAll('a[href="login.html"]').forEach(a=>{a.href=portalURL;});
 const profile=document.createElement('details');profile.className='marketplace-account';profile.hidden=true;
 const summary=document.createElement('summary');summary.className='btn btn-primary';
 const panel=document.createElement('div');panel.className='marketplace-account-panel';
 const identity=document.createElement('p');identity.className='marketplace-account-identity';
 const actions=[['Dashboard',''],['Profil & sesi','account'],['Pesanan saya','orders'],['Keranjang & favorit','shop'],['Notifikasi','notifications'],['Bantuan','support']];
 panel.append(identity);
 for(const [label,view] of actions){const a=document.createElement('a');a.href=portalURL+(view?'?view='+view:'');a.textContent=label;a.addEventListener('click',closeMenu);panel.append(a);}
 const logout=document.createElement('button');logout.type='button';logout.textContent='Keluar akun';logout.className='marketplace-account-logout';panel.append(logout);
 profile.append(summary,panel);link.after(profile);
 const roleNames={customer:'Pelanggan',owner:'Pemilik',worker:'Penjoki',management:'Manajemen',seller:'Penjual'};
 let serial=0,busy=false;
 function renderAccount(account){
  profile.open=false;profile.hidden=!account;link.hidden=Boolean(account);
  summary.textContent=account?'Akun: '+account.display_name:'Akun';
  identity.textContent=account?roleNames[account.role]:'';
  link.textContent=account?'Dashboard':'Masuk / Dasbor';
 }
 async function refreshAccount(){
  if(busy)return;const seq=++serial;
  // Hide stale identity immediately on navigation restoration and revalidation.
  renderAccount(null);
  try{const r=await fetch('/api/me',{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(8000)});const account=r.ok?marketplaceAccountState(await r.json()):null;if(seq===serial&&!busy)renderAccount(account);}catch{if(seq===serial&&!busy)renderAccount(null);}
 }
 logout.addEventListener('click',async()=>{
  if(busy)return;busy=true;serial++;logout.disabled=true;
  try{const r=await fetch('/api/auth/logout',{method:'POST',credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(8000)});if(!r.ok&&r.status!==401)throw Error('Logout gagal');renderAccount(null);showToast('Akun telah keluar.');}
  catch{showToast('Keluar akun belum berhasil dikonfirmasi. Coba lagi.');}
  finally{busy=false;logout.disabled=false;refreshAccount();}
 });
 document.addEventListener('click',e=>{if(!profile.contains(e.target))profile.open=false;});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&profile.open){profile.open=false;summary.focus();}});
 addEventListener('pageshow',e=>{if(e.persisted)refreshAccount();});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshAccount();else{serial++;renderAccount(null);}});
 addEventListener('online',refreshAccount);
 refreshAccount();
}
setupMarketplaceAccount();
if(menu&&marketplaceAccountOrigin(location.origin)){
 const mobileNav=document.createElement('nav');mobileNav.className='marketplace-mobile-nav';mobileNav.setAttribute('aria-label','Navigasi belanja cepat');
 for(const [label,href] of [['Beranda','/'],['Layanan','/layanan.html'],['Keranjang','/keranjang.html'],['Pesanan','/portal.html?view=orders'],['Akun','/portal.html?view=account']]){
  const a=document.createElement('a');a.href=href;a.textContent=label;if(new URL(a.href).pathname===location.pathname&& !a.search)a.setAttribute('aria-current','page');mobileNav.append(a);
 }
 document.body.append(mobileNav);document.body.classList.add('marketplace-mobile-ready');
}
addEventListener('pageshow',e=>{if(e.persisted){basket=savedBasket(readStore('nexoraid-basket',[]),services);updateBasketNav();renderBasket();}});


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
    <label for="homeSearchInput"><span class="terminal-prompt">NEXORAID</span> Cari layanan</label>
    <div class="terminal-search-box"><span class="terminal-search-symbol" aria-hidden="true">&gt;</span><input id="homeSearchInput" name="q" type="search" placeholder="Cari GTA, Windows, akun game..." autocomplete="off" aria-controls="homeSearchResults" aria-expanded="false" aria-label="Cari layanan"><kbd aria-hidden="true">CTRL K</kbd><button type="submit">CARI ↵</button></div>
    <div class="terminal-results" id="homeSearchResults" role="listbox" aria-label="Hasil pencarian" hidden></div>
    <p class="terminal-hint"><strong>Tips:</strong><span>ketik untuk melihat hasil cepat · tekan / atau Ctrl K untuk mencari</span></p>
  </form>`);
}
const ticker = $('.ticker');
if (ticker) {
  const directoryIds = Object.keys(categories).filter(category => category !== 'all');
  const directoryLabels = {gaming: 'Gaming', accounts: 'Akun Game', software: 'Software', mobile: 'Mobile', seller: 'Mitra'};
  const directoryLinks = directoryIds.map((category, index) => {
    const count = services.filter(service => service.category === category).length;
    return `<a class="directory-card" href="layanan.html?category=${encodeURIComponent(category)}"><span class="directory-index">${String(index + 1).padStart(2, '0')}</span><span class="directory-copy"><strong>${esc(directoryLabels[category])}</strong><small>${String(count).padStart(2, '0')} LAYANAN</small></span><span class="directory-arrow" aria-hidden="true">↗</span></a>`;
  }).join('');
  ticker.insertAdjacentHTML('afterend', `<section class="command-center reveal" aria-labelledby="commandCenterTitle"><div class="container">
    <div class="command-center-head"><div><span class="kicker">KATEGORI LAYANAN</span><h2 id="commandCenterTitle">Jelajahi kategori</h2></div><p>Pilih sesuai kebutuhan</p></div>
    <div class="directory-grid">${directoryLinks}</div>
    <div class="system-strip"><span class="system-online">KATALOG DIMUAT</span><span>KATALOG <b>${services.length}</b> LAYANAN</span><span>KATEGORI <b>${directoryIds.length}</b></span><span>BANTUAN MELALUI DISCORD</span></div>
  </div></section>`);
  const showcaseIds = ['gta-nexo-spark', 'akun-game-premium', 'windows-license', 'custom-rom'];
  const showcaseCards = showcaseIds.map(id => services.find(service => service.id === id)).filter(Boolean).map(service => `<a class="showcase-card" href="${serviceHref(service.id)}">
    <span class="showcase-visual showcase-visual--${esc(service.category)}" aria-hidden="true"><span class="showcase-gridlines"></span><span class="showcase-index">NEXO / ${esc(service.category.toUpperCase())}</span><span class="showcase-icon">${icon(service.category)}</span><span class="showcase-scan"></span></span>
    <span class="showcase-info"><span class="showcase-category">${esc(categories[service.category])}</span><strong>${esc(service.name)}</strong><span class="showcase-price">${esc(service.price)}</span></span><span class="showcase-open" aria-hidden="true">↗</span>
  </a>`).join('');
  ticker.nextElementSibling.insertAdjacentHTML('afterend', `<section class="showcase-section" id="showcaseSection" aria-labelledby="showcaseTitle"><div class="container">
    <div class="showcase-heading"><div><span class="kicker">PILIHAN LAYANAN</span><h2 id="showcaseTitle">Pilihan layanan unggulan</h2></div><a class="text-link" href="layanan.html">Jelajahi katalog ↗</a></div>
    <div class="showcase-grid">${showcaseCards}</div>
    <p class="showcase-disclaimer">Visual ilustrasi untuk preview kategori, bukan foto bukti pengerjaan. Detail dan ketersediaan mengikuti halaman layanan.</p>
  </div></section>`);
  reveal();
}
const homeSearchInput = $('#homeSearchInput');
const homeSearchResults = $('#homeSearchResults');
if(homeSearchInput){homeSearchInput.setAttribute('role','combobox');homeSearchInput.setAttribute('aria-autocomplete','list');homeSearchInput.setAttribute('aria-haspopup','listbox');}
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
    ? matches.map(service => `<a role="option" aria-selected="false" data-suggestion href="${serviceHref(service.id)}"><span class="terminal-result-name">${esc(service.name)}<span class="sr-only"> — ${esc(categories[service.category])}</span></span><span class="terminal-result-meta">${esc(service.price)}</span></a>`).join('')
    : '<div class="terminal-empty" role="status">Tidak ada hasil. Coba kata kunci lain.</div>';
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
if ($('#featuredServices')) $('#featuredServices').innerHTML = ['gta-nexo-spark', 'akun-game-random', 'windows-license'].map(id => services.find(s => s.id === id)).filter(Boolean).map((service,index)=>serviceCard(service,index,false)).join('');

const grid = $('#serviceGrid');
if (grid) {
  const search = $('#serviceSearch'), sort = $('#serviceSort');
  const compareSelection = new Map(safeSelection(readStore('nexoraid-compare',[]),services,3).map(id=>[id,services.find(s=>s.id===id)]));
  const maxPrice=$('#maxPrice'), priceType=$('#priceType'), savedOnly=$('#savedOnly');
  $('#advancedFilters').hidden=false;
  const comparePanel = $('#comparePanel');
  const compareTable = $('#compareTable');
  const compareSummary = $('#compareSummary');
  function renderComparison() {
    const selected = [...compareSelection.values()];
    saveStore('nexoraid-compare',selected.map(s=>s.id));
    comparePanel.hidden = selected.length === 0;
    grid.querySelectorAll('[data-compare]').forEach(button => {
      const active = compareSelection.has(button.dataset.compare);
      button.setAttribute('aria-pressed', String(active));
      button.textContent = active ? '✓ Ditambahkan' : '+ Bandingkan';
    });
    if (!selected.length) return;
    compareTable.innerHTML = `<caption class="sr-only">Perbandingan layanan yang dipilih</caption>
      <thead><tr><th scope="col">RINGKASAN</th>${selected.map(service => `<th scope="col"><a href="${serviceHref(service.id)}">${esc(service.name)} ↗</a><button type="button" class="compare-remove" data-remove-compare="${esc(service.id)}" aria-label="Hapus ${esc(service.name)} dari perbandingan">×</button></th>`).join('')}</tr></thead>
      <tbody><tr><th scope="row">Kategori</th>${selected.map(service => `<td>${esc(categories[service.category])}</td>`).join('')}</tr>
      <tr><th scope="row">Harga katalog</th>${selected.map(service => `<td class="compare-price">${esc(service.price)}</td>`).join('')}</tr>
      <tr><th scope="row">Ringkasan</th>${selected.map(service => `<td>${esc(service.desc)}</td>`).join('')}</tr><tr><th scope="row">Rincian paket</th>${selected.map(service=>`<td><ul class="compare-details">${service.details.slice(0,4).map(([k,v])=>`<li><strong>${esc(k)}</strong><br>${esc(v)}</li>`).join('')}</ul></td>`).join('')}</tr></tbody>`;
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
    maxPrice.value=/^\d{1,12}$/.test(params.get('max')||'')?params.get('max'):''; priceType.value=['fixed','variable'].includes(params.get('type'))?params.get('type'):'all'; savedOnly.checked=params.get('saved')==='1';
  }
  function render(mode = 'replace', moveFocus = false) {
    const result = queryCatalog(services, { category, query: search.value, sort: sort.value, page, maxPrice:maxPrice.value===''?null:Math.max(0,Number(maxPrice.value)), priceType:priceType.value, savedIds:savedOnly.checked?favorites:null }); page = result.currentPage;
    const params = new URLSearchParams();
    if (category !== 'all') params.set('category', category);
    if (search.value.trim()) params.set('q', search.value.trim());
    if (sort.value !== 'recommended') params.set('sort', sort.value);
    if (page > 1) params.set('page', page);
    if(maxPrice.value!=='') params.set('max',maxPrice.value); if(priceType.value!=='all')params.set('type',priceType.value); if(savedOnly.checked)params.set('saved','1');
    if (mode !== 'none') history[mode === 'push' ? 'pushState' : 'replaceState'](null, '', location.pathname + (params.size ? '?' + params : '') + location.hash);
    $$('[data-filter]').forEach(button => { const active = button.dataset.filter === category; button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active)); });
    $('#resultCount').textContent = result.total ? `${result.total} layanan · Menampilkan ${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, result.total)}` : '0 layanan ditemukan';
    grid.innerHTML = result.rows.map((service, index) => serviceCard(service, index, true)).join(''); $('#emptyState').hidden = result.total !== 0; renderComparison();
    $('#pagination').innerHTML = result.totalPages > 1 ? Array.from({ length: result.totalPages }, (_, i) => `<button type="button" class="page-button ${page === i + 1 ? 'active' : ''}" data-page="${i + 1}" ${page === i + 1 ? 'aria-current="page"' : ''} aria-label="Halaman ${i + 1}">${i + 1}</button>`).join('') : '';
    $('#clearSearch').hidden = !search.value; document.querySelector('.static-catalog')?.setAttribute('hidden',''); updateFavorites(); reveal();
    if (moveFocus) { $('#resultCount').focus({ preventScroll: true }); $('#catalogControls').scrollIntoView({ behavior: reducedMotion.matches || motionPaused ? 'instant' : 'smooth', block: 'start' }); }
  }
  search.addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => { page = 1; render(); }, 150); });
  $('#catalogSearchForm').addEventListener('submit', event => { event.preventDefault(); clearTimeout(searchTimer); page = 1; render('push'); });
  sort.addEventListener('change', () => { clearTimeout(searchTimer); page = 1; render('push'); });
  $$('[data-filter]').forEach(button => button.addEventListener('click', () => { clearTimeout(searchTimer); category = button.dataset.filter; page = 1; render('push'); }));
  $('#clearSearch').addEventListener('click', () => { clearTimeout(searchTimer); search.value = ''; page = 1; render(); search.focus(); });
  $('#resetFilters').addEventListener('click', () => { clearTimeout(searchTimer); maxPrice.value='';priceType.value='all';savedOnly.checked=false;search.value = ''; sort.value = 'recommended'; category = 'all'; page = 1; render('push'); search.focus(); });
  $('#pagination').addEventListener('click', event => { const button = event.target.closest('[data-page]'); if (button) { page = Number(button.dataset.page); render('push', true); } });
  window.addEventListener('popstate', () => { clearTimeout(searchTimer); readURL(); render('none'); });
  for(const control of [maxPrice,priceType,savedOnly])control.addEventListener('change',()=>{clearTimeout(searchTimer);page=1;render('push');});
  $('#clearAdvanced').addEventListener('click',()=>{clearTimeout(searchTimer);maxPrice.value='';priceType.value='all';savedOnly.checked=false;page=1;render('push');});
  document.addEventListener('nexoraid-favorites',()=>{if(savedOnly.checked){page=1;render();}});
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
  const service = services.find(item => item.id === (detail.dataset.serviceId || new URLSearchParams(location.search).get('id')));
  if (!service) {
    detail.innerHTML = '<div class="empty-state"><span class="empty-symbol">↗</span><h1>Layanan tidak ditemukan.</h1><p>Tautan mungkin tidak lengkap. Temukan layananmu di katalog.</p><a class="btn btn-primary" href="layanan.html">Buka katalog ↗</a></div>';
    document.title = 'Layanan tidak ditemukan — NEXORAID';
  } else {
    document.title = `${service.name} — NEXORAID`;
    $('meta[name="description"]').content = `${service.desc} Harga: ${service.price}. Pemesanan melalui tiket Discord NEXORAID.`;
    if(service.orderable===false||stockBlocked(service)){
      detail.innerHTML=`<h1>${esc(service.name)}</h1><p class="lead">${esc(service.desc)}</p><strong>${esc(service.price)}</strong>${stockLabel(service)?`<p>${esc(stockLabel(service))}. Pesanan rental belum tersedia.</p>`:''}<section class="detail-spec"><h2>Informasi</h2><dl class="spec-list">${service.details.map(([k,v])=>`<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl></section>${service.download_url?`<a class="btn btn-primary" href="${esc(service.download_url)}" target="_blank" rel="noopener noreferrer">Lihat rilis resmi ↗</a>`:''}<p><a href="layanan.html">Kembali ke katalog</a></p>`;
    } else {
    const serviceURL = new URL(serviceHref(service.id), location.href).href;
    const policy=service.policy,promo=policy?.promo;
    const linkedVariants=services.filter(s=>s.parent_id===service.id);
    const options=linkedVariants.length?linkedVariants.flatMap(s=>{const amount=fixedPriceValue(s.price);return amount===null?[]:[{id:s.id,serviceId:s.id,label:s.details[0][0]==='Harga portal saat ini'?s.name:s.details[0][0],amount}];}):packageOptions(service);
    const pricing=pricingInfo(service.price);
    const variantSelect=options.length?'<label for="orderVariant">Pilih paket katalog</label><select id="orderVariant"><option value="">Konfirmasi paket melalui tiket</option>'+options.map(o=>'<option value="'+esc(o.id)+'">'+esc(o.label)+' — '+money(o.amount)+'</option>').join('')+'</select>':'';
    const estimateUI=pricing.type==='fixed'||options.length?'<label for="orderQuantity">Jumlah</label><input type="number" id="orderQuantity" min="1" max="99" value="1"><p id="orderEstimate" role="status"></p>':'';
    const related = services.filter(item => item.category === service.category && item.id !== service.id).slice(0, 3);
    const suggestions = related.length ? related : services.filter(item => item.id !== service.id).slice(0, 3);
    detail.innerHTML = `<nav class="breadcrumbs" aria-label="Breadcrumb"><a href="index.html">Beranda</a><span>/</span><a href="layanan.html?category=${service.category}">${esc(categories[service.category])}</a><span>/</span><span aria-current="page">${esc(service.name)}</span></nav>
      <div class="detail-layout"><div class="detail-main"><span class="category-label">${esc(categories[service.category])}</span><h1>${esc(service.name)}</h1><p class="lead">${esc(service.desc)}</p>
      <section class="detail-spec"><h2>Detail layanan</h2><dl class="spec-list">${service.details.map(([key, value]) => `<div><dt>${esc(key)}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl></section>${policy?`<section class="detail-spec"><h2>Garansi dan promo</h2><p>${esc(policy.warranty_days===null?'Garansi belum ditetapkan.':('Garansi '+policy.warranty_days+' hari — '+policy.warranty_terms))}</p>${promo?`<p>${esc(promo.legacy?'Diskon lama: periode belum dikonfirmasi.':('Promo '+promo.percent+'% · minimum '+promo.min_quantity+' paket · '+new Date(promo.start*1000).toLocaleString('id-ID',{timeZone:'Asia/Jakarta'})+' – '+new Date(promo.end*1000).toLocaleString('id-ID',{timeZone:'Asia/Jakarta'})+' WIB · '+promo.terms))}</p>`:''}</section>`:''}</div>
      <aside class="order-panel" id="pesan"><span class="kicker">RINGKASAN PEMESANAN</span><h2>Pesan layanan</h2><span class="muted">Harga katalog</span><strong class="order-price">${esc(service.price)}</strong><p>Belanja melalui portal NEXORAID. Harga dan tagihan dikonfirmasi sebelum pembayaran.</p>
      <div class="order-draft">${variantSelect}${estimateUI}<label for="orderPlatform">Platform / perangkat</label><input id="orderPlatform" maxlength="100" placeholder="Contoh: PC"><label for="orderRequest">Paket / kebutuhan</label><textarea id="orderRequest" rows="3" maxlength="500" placeholder="Jangan masukkan kata sandi atau OTP"></textarea><button type="button" class="btn btn-primary btn-block" id="buyNow">Beli sekarang</button><button type="button" class="btn btn-ghost btn-block" id="copyOrder">Salin ringkasan (bantuan)</button><button type="button" class="btn btn-ghost btn-block" data-basket="${esc(service.id)}">Tambahkan ke keranjang</button><button type="button" class="btn btn-ghost btn-block" data-favorite="${esc(service.id)}" aria-pressed="false">Favorit</button></div><a class="btn btn-ghost btn-block" href="kontak.html">Lanjut ke kontak &amp; tiket ↗</a><button type="button" class="text-link share-link" id="copyServiceLink">Salin tautan layanan ↗</button>
      <div class="order-note">Harga, ketersediaan, kompatibilitas, risiko dan estimasi dikonfirmasi tim melalui tiket. Gunakan layanan hanya untuk akun atau perangkat milikmu atau yang kamu berwenang kelola. <a href="kebijakan.html">Ketentuan dan privasi</a>.</div><a class="text-link" href="cara-order.html">Lihat cara pemesanan →</a></aside></div>
      <section class="related-section"><div class="section-head"><h2>${related.length ? 'Layanan terkait.' : 'Layanan lainnya.'}</h2><a class="text-link" href="layanan.html?category=${service.category}">Lihat kategori ↗</a></div><div class="service-grid">${suggestions.map((service,index)=>serviceCard(service,index,false)).join('')}</div></section>`;
    function currentOrder(){
      const selected=options.find(o=>o.id===$('#orderVariant')?.value);
      const input=$('#orderQuantity');
      const raw=Number(input?.value||1);
      const quantity=Number.isInteger(raw)?Math.max(1,Math.min(99,raw)):1;
      const actual=selected?.serviceId?services.find(s=>s.id===selected.serviceId):service;
      const amount=selected&&!selected.serviceId?selected.amount:effectiveCatalogUnit(actual,quantity);
      return {selected,quantity,total:amount===null?null:amount*quantity};
    }
    function updateEstimate(){const order=currentOrder();const add=detail.querySelector('[data-basket]');if(add){add.dataset.basket=order.selected?.serviceId||service.id;add.dataset.quantity=String(order.quantity);}const target=$('#orderEstimate');if(!target)return;target.textContent=order.total===null?'Pilih paket untuk melihat estimasi.':'Subtotal indikatif: '+money(order.total)+' (harga final dikonfirmasi tim)';}
    $('#orderVariant')?.addEventListener('change',updateEstimate);
    $('#orderQuantity')?.addEventListener('input',updateEstimate);
    $('#orderQuantity')?.addEventListener('change',()=>{$('#orderQuantity').value=String(currentOrder().quantity);updateEstimate();});
    updateEstimate();
    $('#buyNow').addEventListener('click',()=>{const order=currentOrder();if(options.some(o=>o.serviceId)&&!order.selected){showToast('Pilih varian layanan terlebih dahulu.');return;}if(order.selected&&!order.selected.serviceId){showToast('Paket ini memerlukan konfirmasi tim; pilih layanan yang tersedia di katalog aktif.');return;}openMarketplaceCheckout([{id:order.selected?.serviceId||service.id,quantity:order.quantity}]);});
    $('#copyOrder').addEventListener('click', () => {const order=currentOrder();const info=(order.selected?order.selected.label+'; ':'')+$('#orderRequest').value.trim();const suffix='\nJumlah: '+order.quantity+(order.total===null?'':'\nSubtotal indikatif: '+money(order.total));copyText(orderText(service, serviceURL).replace('Game / platform / perangkat: ',()=> 'Game / platform / perangkat: '+$('#orderPlatform').value.trim()).replace('Paket / spesifikasi / request: ',()=> 'Paket / spesifikasi / request: '+info)+suffix, 'Ringkasan disalin. Tempelkan di tiket Discord.');});
    $('#copyServiceLink').addEventListener('click', () => copyText(serviceURL, 'Tautan layanan disalin.'));
    }
  }
}
$('#faqSearch')?.addEventListener('input', () => {
  const query = $('#faqSearch').value.trim().toLocaleLowerCase('id'); let count = 0;
  $$('.faq-item').forEach(row => { row.hidden = !row.textContent.toLocaleLowerCase('id').includes(query); if (!row.hidden) count++; });
  $('#faqEmpty').hidden = count !== 0; $('#faqCount').textContent = `${count} pertanyaan`;
});
reveal();

function openMarketplaceCheckout(rows,{fromBasket=false}={}){
 if(!catalogue.live){showToast('Katalog aktif belum tersedia. Muat ulang sebelum checkout.');return;}
 if(!rows.length||rows.length>5||basketHasUnavailable(rows,services)||rows.some(r=>!Number.isInteger(r.quantity)||r.quantity<1||r.quantity>99||!services.some(s=>s.id===r.id&&s.orderable!==false&&!stockBlocked(s)))){showToast('Pilih 1–5 layanan berbeda yang tersedia sebelum checkout.');return;}
 const url=new URL('https://nexoraid-v4.nexoraid.workers.dev/portal.html');
 // Only public catalog IDs and quantities cross origins; never send notes, prices or credentials.
 url.searchParams.set('view','shop');
 if(fromBasket&&marketplaceAccountOrigin(location.origin))url.searchParams.set('from','basket');
 url.hash='cart='+encodeURIComponent(JSON.stringify(rows.map(r=>({service_id:r.id,quantity:r.quantity}))));
 location.assign(url.href);
}
function renderBasket(){
 const host=$('#basketItems');if(!host)return;
 host.innerHTML=basket.length?basket.map(row=>{const s=services.find(x=>x.id===row.id);return '<article class="basket-row"><div><h3><a href="'+esc(serviceHref(s.id))+'">'+esc(s.name)+'</a></h3><p>'+esc(s.price)+'</p>'+(stockLabel(s)?'<p>'+esc(stockLabel(s))+'</p>':'')+'</div><label>Jumlah <input type="number" min="1" max="99" value="'+row.quantity+'" data-quantity="'+esc(s.id)+'"></label><button type="button" class="btn btn-ghost" data-remove-basket="'+esc(s.id)+'">Hapus</button></article>';}).join(''):'<div class="empty-state"><h2>Keranjang masih kosong</h2><p>Pilih layanan yang ingin dikonsultasikan.</p><a class="btn btn-primary" href="layanan.html">Jelajahi katalog</a></div>';
 const sums=basketTotals(basket,services);$('#basketTotal').textContent='Subtotal harga tetap (indikatif): '+money(sums.total)+'. '+sums.needsQuote+' layanan perlu penawaran.';const unavailable=basketHasUnavailable(basket,services);if(unavailable)$('#basketTotal').textContent+=' Hapus rental yang stoknya belum tersedia sebelum menyalin pesanan.';$('#basketCopy').disabled=!basket.length||unavailable;$('#basketClear').disabled=!basket.length;const checkout=$('#basketCheckout');if(checkout)checkout.disabled=!catalogue.live||!basket.length||basket.length>5||unavailable;
}
document.addEventListener('click',event=>{
 const fav=event.target.closest('[data-favorite]');const add=event.target.closest('[data-basket]');const rem=event.target.closest('[data-remove-basket]');
 if(fav){const id=fav.dataset.favorite;if(!services.some(s=>s.id===id))return;favorites=favorites.includes(id)?favorites.filter(x=>x!==id):safeSelection([...favorites,id],services);const stored=saveStore('nexoraid-favorites',favorites);updateFavorites();if(!stored)showToast('Favorit hanya tersimpan pada halaman ini.');document.dispatchEvent(new Event('nexoraid-favorites'));}
 if(add)addBasket(add.dataset.basket,Number(add.dataset.quantity||1));
 if(rem){basket=basket.filter(r=>r.id!==rem.dataset.removeBasket);saveStore('nexoraid-basket',basket);updateBasketNav();renderBasket();}
});
$('#basketItems')?.addEventListener('change',event=>{const id=event.target.dataset.quantity;if(!id)return;const row=basket.find(r=>r.id===id);if(!row)return;const value=Number(event.target.value);row.quantity=Number.isInteger(value)?Math.max(1,Math.min(99,value)):1;saveStore('nexoraid-basket',basket);updateBasketNav();renderBasket();});
$('#basketCheckout')?.addEventListener('click',()=>openMarketplaceCheckout(basket,{fromBasket:true}));
$('#basketClear')?.addEventListener('click',()=>{basket=[];saveStore('nexoraid-basket',basket);updateBasketNav();renderBasket();});
$('#favoritesClear')?.addEventListener('click',()=>{favorites=[];saveStore('nexoraid-favorites',favorites);updateFavorites();showToast('Favorit dihapus.');});
$('#basketForm')?.addEventListener('submit',event=>{event.preventDefault();if(basketHasUnavailable(basket,services)){showToast('Stok rental belum tersedia. Hapus layanan tersebut atau muat ulang katalog.');return;}if(basket.length)copyText(basketText(basket,services,$('#basketNote').value),'Ringkasan disalin. Tempelkan di tiket Discord.');});
renderBasket();updateFavorites();
// Branch publishing fallback: prices and downloads work even without generated artifacts.
const priceHost = $('#priceListStatic');
if (priceHost && (!builtSite||catalogue.live)) {
  priceHost.innerHTML = '<div class="price-table-wrap"><table class="price-table"><caption>Harga katalog</caption><thead><tr><th scope="col">Layanan</th><th scope="col">Harga</th></tr></thead><tbody>'+services.map(s=>'<tr><th scope="row"><a href="'+esc(serviceHref(s.id))+'">'+esc(s.name)+'</a></th><td>'+esc(s.price)+'</td></tr>').join('')+'</tbody></table></div>';
}
const priceDownload = $('#priceDownload');
if (priceDownload && (!builtSite||catalogue.live)) {
  priceDownload.href = URL.createObjectURL(new Blob([priceCSV(services)],{type:'text/csv;charset=utf-8'}));
  priceDownload.download = 'pricelist.csv';
}


const promotionHost=$('#livePromotions');
if(promotionHost){
 const dateFmt=new Intl.DateTimeFormat('id-ID',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Jakarta'});
 const renderPromotions=()=>{const rows=activePromotions(services,catalogue.live);promotionHost.innerHTML=rows.length?'<ul>'+rows.map(s=>{const p=s.policy.promo;return '<li><a href="'+esc(serviceHref(s.id))+'">'+esc(s.name)+'</a> — diskon '+p.percent+'%, minimum '+p.min_quantity+' paket. '+esc(dateFmt.format(new Date(p.start*1000)))+' – '+esc(dateFmt.format(new Date(p.end*1000)))+' WIB. '+esc(p.terms)+'</li>';}).join('')+'</ul>':'<p>'+(catalogue.live?'Tidak ada promo aktif yang terverifikasi saat ini.':'Katalog aktif tidak tersedia; promo tidak dapat dikonfirmasi.')+'</p>';};
 renderPromotions();window.addEventListener('focus',renderPromotions);setInterval(renderPromotions,30000);
}

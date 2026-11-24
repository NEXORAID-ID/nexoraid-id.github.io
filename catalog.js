export const categories = {
  all: 'Semua', gaming: 'Gaming', accounts: 'Akun Game',
  software: 'Software', mobile: 'Mobile', seller: 'Mitra'
};

export const PAGE_SIZE = 9;
const synonyms = { joki:'boost', lisensi:'license', lisence:'license', hp:'mobile', handphone:'mobile', ponsel:'mobile', reseller:'seller', 'windows':'windows', 'akun':'akun' };
export function searchTerms(query) { return String(query ?? '').normalize('NFKC').toLocaleLowerCase('id').trim().split(/\s+/).filter(Boolean); }
export function matchesSearch(text, terms) { const normalized = text.normalize('NFKC').toLocaleLowerCase('id'); return terms.every(t=>normalized.includes(t) || (Object.hasOwn(synonyms,t) && normalized.includes(synonyms[t]))); }
export function safeSelection(raw, services, limit = 50) { const ids = Array.isArray(raw) ? raw : []; return [...new Set(ids.filter(id=>typeof id==='string' && services.some(s=>s.id===id)))].slice(0,limit); }
export function safeBasket(raw, services) { if (!Array.isArray(raw)) return []; const out=[]; for (const row of raw) { if (!row || !services.some(s=>s.id===row.id) || out.some(s=>s.id===row.id)) continue; const quantity=Number(row.quantity); if (Number.isInteger(quantity) && quantity>=1 && quantity<=99) out.push({id:row.id,quantity}); } return out.slice(0,50); }
export function basketTotals(rows, services) { let total=0,needsQuote=0; for (const row of safeBasket(rows,services)) { const price=fixedPriceValue(services.find(s=>s.id===row.id).price); if(price===null) needsQuote++; else total+=price*row.quantity; } return {total,needsQuote}; }
export function basketText(rows, services, note='') { const items=safeBasket(rows,services); const sums=basketTotals(items,services); return ['Halo tim NEXORAID!', '', 'Saya ingin meminta konfirmasi layanan:', ...items.map(row=>{const s=services.find(s=>s.id===row.id);return '- '+s.name+' × '+row.quantity+' — '+s.price;}),'','Subtotal harga tetap (indikatif): Rp'+sums.total.toLocaleString('id-ID'), 'Layanan yang memerlukan penawaran: '+sums.needsQuote, 'Catatan: '+String(note).slice(0,500), '', 'Mohon konfirmasi ketersediaan, rincian, harga final dan estimasi sebelum pembayaran.'].join('\n'); }

export const escapeHTML = value => String(value).replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[char]);

export function priceValue(price) {
  const match = price.match(/Rp\s*([\d.]+)\s*(K|JT)?/i);
  if (!match) return null;
  return Number(match[1].replaceAll('.', '')) * (match[2]?.toUpperCase() === 'K' ? 1000 : match[2]?.toUpperCase() === 'JT' ? 1000000 : 1);
}

export function fixedPriceValue(price) {
  const match = price.trim().match(/^(?:Daftar\s+)?Rp\s*(\d{1,3}(?:\.\d{3})+|\d+)$/i);
  return match ? Number(match[1].replaceAll('.', '')) : null;
}

export function pricingInfo(price) {
 const value=String(price).trim();const fixed=fixedPriceValue(value);
 if(fixed!==null)return {type:'fixed',min:fixed,max:fixed};
 const values=[...value.matchAll(/Rp\s*([\d.]+)\s*(K|JT)?/gi)].map(m=>Number(m[1].replaceAll('.',''))*(m[2]?.toUpperCase()==='K'?1000:m[2]?.toUpperCase()==='JT'?1000000:1)).filter(Number.isFinite);
 if(values.length>=2)return {type:'range',min:Math.min(...values),max:Math.max(...values)};
 if(values.length===1)return {type:'starting',min:values[0],max:null};
 return {type:'quote',min:null,max:null};
}
export function packageOptions(service){
 if(pricingInfo(service.price).type!=='starting')return [];
 return service.details.flatMap(([label,value],index)=>{const match=value.match(/^Rp\s*(\d{1,3}(?:\.\d{3})+|\d+)(?=\s|$)/i);return match?[{id:String(index),label,amount:Number(match[1].replaceAll('.',''))}]:[];});
}
export function comparisonTotals(services) {
  const prices = services.map(service => fixedPriceValue(service.price));
  return {
    knownTotal: prices.reduce((total, price) => total + (price ?? 0), 0),
    needsQuote: prices.filter(price => price === null).length
  };
}

export function queryCatalog(services, {category = 'all', query = '', sort = 'recommended', page = 1, maxPrice = null, priceType = 'all', savedIds = null} = {}) {
  const terms = searchTerms(query);
  const rows = services.filter(service => {
    if (category !== 'all' && service.category !== category) return false;
    const text = [service.name, service.desc, categories[service.category], ...service.details.flat()].join(' ').toLocaleLowerCase('id');
    const price=priceValue(service.price); const fixed=fixedPriceValue(service.price);
    if (maxPrice !== null && Number.isFinite(maxPrice) && (price===null || price>maxPrice)) return false;
    if (priceType==='fixed' && fixed===null || priceType==='variable' && fixed!==null) return false;
    if (Array.isArray(savedIds) && !savedIds.includes(service.id)) return false;
    return matchesSearch(text,terms);
  });
  if (sort === 'name') rows.sort((a, b) => a.name.localeCompare(b.name, 'id'));
  if (sort === 'price-asc' || sort === 'price-desc') rows.sort((a, b) => {
    const x = priceValue(a.price), y = priceValue(b.price);
    if (x === null) return y === null ? 0 : 1;
    if (y === null) return -1;
    return sort === 'price-asc' ? x - y : y - x;
  });
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const currentPage = Math.min(totalPages, Math.max(1, Number.parseInt(page, 10) || 1));
  return { rows: rows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE), total: rows.length, totalPages, currentPage };
}

export function orderText(service, url) {
  return `Halo admin NEXORAID!\n\nSaya ingin order:\nLayanan: ${service.name}\nHarga katalog: ${service.price}\nDetail: ${url}\n\nGame / platform / perangkat: \nPaket / spesifikasi / request: \n\nMohon konfirmasi stok, harga final, dan estimasi proses. Terima kasih!`;
}

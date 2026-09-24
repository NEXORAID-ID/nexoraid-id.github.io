export const categories = {
  all: 'Semua', gaming: 'Gaming', accounts: 'Akun Game',
  software: 'Software', mobile: 'Mobile', seller: 'Seller'
};

export const PAGE_SIZE = 9;
export const escapeHTML = value => String(value).replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[char]);

export function priceValue(price) {
  const match = price.match(/Rp\s*([\d.]+)\s*(K|JT)?/i);
  if (!match) return null;
  return Number(match[1].replaceAll('.', '')) * (match[2]?.toUpperCase() === 'K' ? 1000 : match[2]?.toUpperCase() === 'JT' ? 1000000 : 1);
}

export function queryCatalog(services, {category = 'all', query = '', sort = 'recommended', page = 1} = {}) {
  const terms = query.trim().toLocaleLowerCase('id').split(/\s+/).filter(Boolean);
  const rows = services.filter(service => {
    if (category !== 'all' && service.category !== category) return false;
    const text = [service.name, service.desc, categories[service.category], ...service.details.flat()].join(' ').toLocaleLowerCase('id');
    return terms.every(term => text.includes(term));
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

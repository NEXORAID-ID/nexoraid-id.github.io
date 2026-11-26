// Recover previously shared static detail URLs when GitHub publishes the source branch.
(() => {
  const path = location.pathname;
  const match = path.match(/^(.*\/)layanan-([a-z0-9-]+)\.html$/);
  if (!match) return;
  const destination = new URL(match[1]+'detail.html',location.origin);
  destination.searchParams.set('id',match[2]);
  destination.hash = location.hash;
  if(destination.origin===location.origin) location.replace(destination.href);
})();

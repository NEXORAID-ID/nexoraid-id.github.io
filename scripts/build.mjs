import { mkdir, readFile, writeFile, copyFile, readdir, stat, rm, lstat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONFIG, services } from '../services-data.js';
import { escapeHTML } from '../catalog.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'dist');
const pages = ['index.html', 'layanan.html', 'detail.html', 'cara-order.html', 'seller.html', 'faq.html', '404.html'];
const siteURL = process.env.SITE_URL ? new URL(process.env.SITE_URL.replace(/\/$/, '') + '/') : null;
if (siteURL && !['https:', 'http:'].includes(siteURL.protocol)) throw new Error('SITE_URL must be HTTP(S).');
const basePath = siteURL ? siteURL.pathname : '/';
// Only clean this build's dedicated, resolved output directory, never a symlink.
if (output !== path.resolve(root, 'dist') || path.dirname(output) !== root) throw new Error('Unsafe output directory.');
try { if ((await lstat(output)).isSymbolicLink()) throw new Error('Refusing to clean a symlink output directory.'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await mkdir(path.join(output, 'assets'), { recursive: true });

for (const page of pages) {
  let content = await readFile(path.join(root, page), 'utf8');
  content = content.replace(/href="https:\/\/discord\.com\/channels\/\d+\/\d+"/g, `href="${escapeHTML(CONFIG.discordUrl)}"`);
  if (page === '404.html') content = content.replace('href="./index.html"', `href="${escapeHTML(basePath)}index.html"`);
  if (siteURL && page !== '404.html') {
    const canonical = page === 'detail.html' ? '' : `<link rel="canonical" href="${new URL(page === 'index.html' ? '' : page, siteURL).href}">`;
    content = content.replace('</head>', `${canonical}<meta property="og:image" content="${new URL('assets/nexoraid-logo-transparent.png', siteURL).href}"><meta property="og:image:alt" content="NEXORAID — Digital Services"><meta property="og:site_name" content="NEXORAID"></head>`);
  }
  await writeFile(path.join(output, page), content);
}
for (const file of ['app.js', 'loader.js', 'catalog.js', 'services-data.js', 'styles.css', '.nojekyll']) await copyFile(path.join(root, file), path.join(output, file));
for (const asset of await readdir(path.join(root, 'assets'))) {
  if (/\.(png|webp|jpg|svg|woff2)$/.test(asset)) await copyFile(path.join(root, 'assets', asset), path.join(output, 'assets', asset));
}
try { await copyFile(path.join(root, 'CNAME'), path.join(output, 'CNAME')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
await writeFile(path.join(output, 'robots.txt'), `User-agent: *\nAllow: /\n${siteURL ? 'Sitemap: ' + new URL('sitemap.xml', siteURL).href + '\n' : ''}`);
// Emit a sitemap only when the real deployment URL is known.
if (siteURL) {
  const urls = [...pages.filter(p => !['404.html', 'detail.html'].includes(p)).map(p => p === 'index.html' ? '' : p), ...services.map(s => 'detail.html?id=' + encodeURIComponent(s.id))];
  await writeFile(path.join(output, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(url => `<url><loc>${escapeHTML(new URL(url, siteURL).href)}</loc></url>`).join('\n')}\n</urlset>\n`);
} else {
  // An empty sitemap replaces any previous production URLs in local previews.
  await writeFile(path.join(output, 'sitemap.xml'), '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"/>\n');
}

// Verify references against the artifact, including GitHub Pages subpath-safe links.
let references = 0;
for (const page of pages.filter(p => p !== '404.html')) {
  const content = await readFile(path.join(output, page), 'utf8');
  for (const [, value] of content.matchAll(/(?:href|src)="([^"]+)"/g)) {
    if (/^(?:https?:|#|data:)/.test(value)) continue;
    const filename = decodeURIComponent(value.split(/[?#]/)[0]);
    if (!filename) continue;
    if (filename.startsWith('/')) throw new Error(`${page}: root-relative link breaks project Pages: ${value}`);
    const target = path.resolve(output, filename);
    if (!target.startsWith(output + path.sep)) throw new Error(`${page}: link escapes site: ${value}`);
    if (!(await stat(target)).isFile()) throw new Error(`${page}: missing target ${value}`);
    references++;
  }
}
console.log(`Built ${pages.length} pages + ${services.length} service records. Verified ${references} local links/assets.`);
console.log(`Output: ${output}${siteURL ? '\nSite: ' + siteURL.href : ''}`);

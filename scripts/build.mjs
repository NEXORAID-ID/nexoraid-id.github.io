import { mkdir, readFile, writeFile, copyFile, readdir, stat, rm, lstat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONFIG, services } from '../services-data.js';
import { escapeHTML, priceCSV } from '../catalog.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'dist');
const pages = ['index.html', 'layanan.html', 'detail.html', 'cara-order.html', 'seller.html', 'faq.html', 'tentang.html', 'kontak.html', 'kebijakan.html', 'promo.html', 'harga.html', 'keranjang.html', '404.html'];
const siteURL = process.env.SITE_URL ? new URL(process.env.SITE_URL.replace(/\/$/, '') + '/') : null;
if (siteURL && !['https:', 'http:'].includes(siteURL.protocol)) throw new Error('SITE_URL must be HTTP(S).');
const basePath = siteURL ? siteURL.pathname : '/';
// Only clean this build's dedicated, resolved output directory, never a symlink.
if (output !== path.resolve(root, 'dist') || path.dirname(output) !== root) throw new Error('Unsafe output directory.');
try { if ((await lstat(output)).isSymbolicLink()) throw new Error('Refusing to clean a symlink output directory.'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await mkdir(path.join(output, 'assets'), { recursive: true });

const layout = await readFile(path.join(root,'index.html'),'utf8');
const header=layout.match(/<header class="site-header">[\s\S]*?<\/header>/)?.[0];
const footer=layout.match(/<footer class="footer">[\s\S]*?<\/footer>/)?.[0];
if(!header||!footer)throw new Error('Missing layout');
const servicePages=services.map(s=>'layanan-'+s.id+'.html');
const serviceHref=s=>'layanan-'+s.id+'.html';
const staticCatalog='<section class="static-catalog"><h2>Daftar layanan</h2><ul>'+services.map(s=>'<li><a href="'+serviceHref(s)+'">'+escapeHTML(s.name)+'</a><p>'+escapeHTML(s.desc)+'</p><strong>'+escapeHTML(s.price)+'</strong></li>').join('')+'</ul></section>';
const priceTable='<div class="price-table-wrap"><table class="price-table"><caption>Harga katalog</caption><thead><tr><th scope="col">Layanan</th><th scope="col">Harga</th></tr></thead><tbody>'+services.map(s=>'<tr><th scope="row"><a href="'+serviceHref(s)+'">'+escapeHTML(s.name)+'</a></th><td>'+escapeHTML(s.price)+'</td></tr>').join('')+'</tbody></table></div>';
const seller=services.find(s=>s.id==='seller');
const sellerFee=seller.details.find(([key])=>key==='Biaya Daftar')[1];
for (const page of pages) {
  let content = await readFile(path.join(root, page), 'utf8');
  if(page!=='404.html'){
    const active=page==='detail.html'?'layanan.html':page;
    const activeHeader=header.replace(/ aria-current="page"/g,'').replace('href="'+active+'"','href="'+active+'" aria-current="page"');
    content=content.replace(/<header class="site-header">[\s\S]*?<\/header>/,activeHeader).replace(/<footer class="footer">[\s\S]*?<\/footer>/,footer);
    if(page==='faq.html'||page==='seller.html') content=content.replace(/Rp1\.500\.000/g,()=>escapeHTML(sellerFee));
    if(page==='faq.html')for(const [id,previous] of [['windows-license','Rp75.000'],['office-license','Rp75.000'],['windows-office-bundle','Rp100.000']]) {const service=services.find(s=>s.id===id); const label=id==='windows-license'?'Windows 10/11 License':id==='office-license'?'Microsoft Office License':'Bundle Windows + Office'; content=content.replace(label+' '+previous,()=>label+' '+escapeHTML(service.price));}
    if(page==='layanan.html')content=content.replace('<div class="service-grid" id="serviceGrid"></div>','<div class="service-grid" id="serviceGrid"></div>'+staticCatalog);
    if(page==='harga.html')content=content.replace('<div id="priceListStatic"></div>',priceTable);
    if(page==='detail.html')content=content.replace('<p class="loading-copy">Menyiapkan detail layanan…</p>','<h1>Detail layanan</h1><p>Jika detail tidak muncul, pilih layanan di katalog.</p><a href="layanan.html">Buka katalog</a>');
  }
  content = content.replace(/href="https:\/\/discord\.com\/channels\/\d+\/\d+"/g, `href="${escapeHTML(CONFIG.discordUrl)}"`);
  if(page==='kontak.html') content=content.replace(/href="https:\/\/discord\.gg\/[A-Za-z0-9-]+"/g,()=> 'href="'+escapeHTML(CONFIG.discordInvite)+'"');
  else content=content.replace(/<a\b[^>]*\bdata-discord-link\b[^>]*>/g,tag=>tag.replace(/href="[^"]*"/,'href="kontak.html"').replace(/\s+target="_blank"/,'').replace(/\s+rel="noopener noreferrer"/,'').replace(/\s+data-discord-link\b/,''));
  if (page === '404.html') content = content.replace('href="./index.html"', `href="${escapeHTML(basePath)}index.html"`).replace('src="/route-fallback.js"', `src="${escapeHTML(basePath)}route-fallback.js"`);
  if (siteURL && page !== '404.html') {
    const canonical = page === 'detail.html' ? '' : `<link rel="canonical" href="${new URL(page === 'index.html' ? '' : page, siteURL).href}">`;
    content = content.replace('</head>', `${canonical}<meta property="og:image" content="${new URL('assets/nexoraid-logo-transparent.png', siteURL).href}"><meta property="og:image:alt" content="NEXORAID — Digital Services"><meta property="og:site_name" content="NEXORAID"></head>`);
  }
  if(page !== '404.html') content = content.replace('</head>', '<meta name="nexoraid-build" content="static"></head>');
  await writeFile(path.join(output, page), content);
}
const template=await readFile(path.join(output,'detail.html'),'utf8');
for(const s of services){
 const filename=serviceHref(s);const title=escapeHTML(s.name+' — NEXORAID');const desc=escapeHTML(s.desc+' Harga: '+s.price);
 const fallback='<div class="container" id="detailContent" data-service-id="'+escapeHTML(s.id)+'"><nav class="breadcrumbs"><a href="layanan.html">Katalog</a></nav><h1>'+escapeHTML(s.name)+'</h1><p class="lead">'+escapeHTML(s.desc)+'</p><p><strong>'+escapeHTML(s.price)+'</strong></p><section class="detail-spec"><h2>Detail layanan</h2><dl class="spec-list">'+s.details.map(([k,v])=>'<div><dt>'+escapeHTML(k)+'</dt><dd>'+escapeHTML(v)+'</dd></div>').join('')+'</dl></section><p id="pesan"><a class="btn btn-primary" href="kontak.html">Kontak &amp; tiket</a></p></div>';
 let html=template.replace(/<title>.*?<\/title>/,()=>'<title>'+title+'</title>').replace(/(<meta name="description" content=")[^"]*"/,(_,a)=>a+desc+'"').replace(/(<meta property="og:title" content=")[^"]*"/,(_,a)=>a+title+'"').replace(/(<meta property="og:description" content=")[^"]*"/,(_,a)=>a+desc+'"').replace(/<div class="container" id="detailContent">[\s\S]*?<\/noscript>/,()=>fallback);
 if(siteURL)html=html.replace('</head>','<link rel="canonical" href="'+escapeHTML(new URL(filename,siteURL).href)+'"><meta property="og:url" content="'+escapeHTML(new URL(filename,siteURL).href)+'"></head>');
 if(!html.includes('data-service-id="'+s.id+'"'))throw Error('Static detail generation failed: '+s.id);
 await writeFile(path.join(output,filename),html);
}
// Public login landing works on static Pages; authentication stays on the Worker.
await copyFile(path.join(root,'v4','login.html'),path.join(output,'login.html'));
await copyFile(path.join(root,'v4','portal.css'),path.join(output,'portal.css'));
await writeFile(path.join(output,'pricelist.csv'), priceCSV(services));
for (const file of ['app.js', 'catalog.js', 'live-catalog.js', 'services-data.js', 'styles.css', 'premium.css', 'route-fallback.js', '.nojekyll']) await copyFile(path.join(root, file), path.join(output, file));
for (const asset of await readdir(path.join(root, 'assets'))) {
  if (/\.(png|webp|jpg|svg|woff2)$/.test(asset)) await copyFile(path.join(root, 'assets', asset), path.join(output, 'assets', asset));
}
try { await copyFile(path.join(root, 'CNAME'), path.join(output, 'CNAME')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
await writeFile(path.join(output, 'robots.txt'), `User-agent: *\nAllow: /\n${siteURL ? 'Sitemap: ' + new URL('sitemap.xml', siteURL).href + '\n' : ''}`);
// Emit a sitemap only when the real deployment URL is known.
if (siteURL) {
  const urls = [...pages.filter(p => !['404.html', 'detail.html'].includes(p)).map(p => p === 'index.html' ? '' : p), ...servicePages];
  await writeFile(path.join(output, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(url => `<url><loc>${escapeHTML(new URL(url, siteURL).href)}</loc></url>`).join('\n')}\n</urlset>\n`);
} else {
  // An empty sitemap replaces any previous production URLs in local previews.
  await writeFile(path.join(output, 'sitemap.xml'), '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"/>\n');
}

// Verify references against the artifact, including GitHub Pages subpath-safe links.
let references = 0;
for (const page of [...pages.filter(p => p !== '404.html'),'login.html',...servicePages]) {
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
console.log(`Built ${pages.length + servicePages.length} pages including ${services.length} static service pages. Verified ${references} local links/assets.`);
console.log(`Output: ${output}${siteURL ? '\nSite: ' + siteURL.href : ''}`);

# NEXORAID — Multipage Digital Service Hub

Website statis multipage bertema ungu, pink, dan biru. Siap dibuild dan dideploy ke GitHub Pages. Tidak membutuhkan API key, database, atau dependensi npm.

## Halaman

- `index.html` — Beranda, logo PNG transparan, animasi orbit, pilihan layanan, dan program seller.
- `layanan.html` — Katalog 32 layanan, pencarian isi detail, filter kategori, urutan nama/harga, pagination, dan kondisi hasil kosong.
- `detail.html?id=akun-game-premium` — Detail yang bisa dibagikan, pricelist lengkap, salin format pesanan, salin tautan, dan layanan terkait. Semua 32 ID layanan bisa dibuka langsung.
- `cara-order.html` — Alur pemesanan serta catatan GTA, akun game, dan lisensi.
- `seller.html` — Program seller Rp500.000 dan langkah pendaftaran.
- `faq.html` — Pencarian pertanyaan dan accordion yang bisa dibuka lewat keyboard.
- `404.html` — Halaman tidak ditemukan, termasuk tautan beranda yang disesuaikan dengan subfolder repository saat build.

## Fitur

- Empat layanan akun game: Random, Starter, Premium, Custom. Harga **Sesuai Request**; disesuaikan stok, spesifikasi, dan kebutuhan customer.
- Seluruh data GTA Online dan Windows/Office sebelumnya dipertahankan.
- Tombol Open Ticket/Order menuju channel Discord yang sudah dikonfigurasi.
- Search, kategori, sort, dan nomor halaman tersimpan di URL; mendukung refresh dan tombol Back browser.
- Pencarian mencakup nama, deskripsi, kategori, serta isi pricelist. Harga request ditempatkan terakhir dalam pengurutan harga.
- Salin format pesanan dan link layanan. Jika clipboard ditolak browser, tersedia dialog salin manual.
- Responsive mobile/tablet/desktop, menu mobile, skip link, focus indicator, breadcrumb, dan kembali ke atas.
- Loading page neon dengan orbit, logo, garis cahaya, tombol lewati, dan batas waktu otomatis 4 detik. Loading dilewati saat reduced motion/jeda animasi aktif; tetap aman jika modul aplikasi gagal.
- Logo melayang, orbit berputar, partikel, gradien bergerak, kilau tombol, kartu tilt mengikuti kursor, reveal, dan ticker.
- Animasi dapat dijeda lewat footer. Preferensi berlaku selama sesi browser dan menghormati `prefers-reduced-motion`.
- Build memeriksa tautan/aset lokal. Metadata sosial dan sitemap dibuat dengan URL deployment sebenarnya.
- Pemesanan dan pembayaran melalui tiket/admin. Website tidak menyimpan data akun, password, pembayaran, atau pesanan.

## Menjalankan lokal

Gunakan Node.js 22 atau lebih baru. Tidak perlu `npm install`.

```sh
npm run dev
```

Buka **http://127.0.0.1:4173/**. Setelah mengubah source, jalankan `npm run build`, lalu refresh browser. Preview menyajikan folder `dist/`. Jangan membuka file dengan `file://`, karena browser membatasi JavaScript modules pada protokol tersebut.

```sh
npm run check    # sintaks, 8 pengujian katalog, build, dan pemeriksaan tautan
npm run build    # menghasilkan dist/
npm run preview  # menyajikan build terakhir di port 4173
```

`PORT` dapat diatur jika port 4173 sudah terpakai. `BASE_PATH` pada server preview dapat digunakan untuk menguji subfolder, misalnya `/nexoraid-web`.

## Deploy ke GitHub Pages

1. Buat repository GitHub dan upload **isi folder project**, termasuk `.github`, `scripts`, `tests`, `assets`, dan file HTML/JS/CSS. Gunakan branch `main` atau `master`.
2. Buka **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Push perubahan atau jalankan workflow **Check and deploy GitHub Pages** dari tab **Actions**.
4. Tunggu job `build` dan `deploy` selesai. URL website tersedia di environment **github-pages** dan Settings → Pages.

Workflow `.github/workflows/pages.yml` menjalankan pemeriksaan, mengambil URL Pages, membuat build, mengunggah `dist/`, lalu deploy. Pull request hanya diperiksa dan dibuild; tidak dideploy. Aset dan tautan memakai jalur relatif sehingga mendukung `https://username.github.io/nama-repo/` maupun domain sendiri. `SITE_URL` diisi otomatis dari GitHub Pages, bukan URL contoh.

Jika nama branch berbeda, ubah daftar branch pada workflow. Untuk custom domain, atur domain pada Settings → Pages dan konfigurasi DNS sesuai panduan GitHub. File `CNAME` opsional di root akan disalin ke build jika tersedia.

Dokumentasi resmi: https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages

## Mengubah layanan, harga, dan Discord

Edit `services-data.js`:

- `CONFIG.discordUrl` adalah tujuan resmi semua order.
- `services` memuat ID, nama, kategori, deskripsi, harga, dan detail.
- Kategori: `gaming`, `accounts`, `software`, `mobile`, `seller`.
- Pertahankan ID agar tautan detail yang sudah dibagikan tetap bekerja.

Contoh data:

```js
{
  id: "akun-game-custom",
  category: "accounts",
  name: "Akun Game Custom",
  desc: "Request akun sesuai game dan spesifikasi yang diinginkan.",
  price: "Sesuai Request",
  details: [["Harga", "Sesuai Request"], ["Order", "Via tiket / admin"]]
}
```

Copy umum yang muncul di FAQ atau panduan berada di file HTML masing-masing. Jika mengubah harga umum di katalog, sesuaikan juga teks FAQ/panduan yang menyebut harga tersebut. Header dan footer berupa HTML statis di setiap halaman; ubah secara konsisten jika menambahkan navigasi baru.

## Struktur

```text
.github/workflows/pages.yml   CI dan deployment
assets/                      Logo SVG + hero PNG transparan
scripts/build.mjs            Build statis, metadata, sitemap, validasi link
scripts/serve.mjs            Preview lokal tanpa dependensi
tests/catalog.test.mjs      Tes data dan fungsi katalog
services-data.js             Semua pricelist dan URL Discord
catalog.js                   Search, sort, pagination, format order, escaping
app.js                       Interaksi halaman dan animasi
loader.js                    Loading mandiri dan fallback
styles.css                   Desain responsive dan pengaturan gerakan
*.html                       Halaman multipage
```

`dist/` adalah hasil build dan boleh dibuat ulang. Script build hanya membersihkan direktori `dist` yang terverifikasi di dalam project.

## Aset dan batasan

Logo hero final: `assets/nexoraid-logo-transparent.png` (RGBA dengan kanal alpha), dibuat lewat ImageGen bawaan. Header/favicon menggunakan SVG transparan. Lihat `assets/README.md` untuk brief aset.

Font Inter dan Space Grotesk dimuat dari Google Fonts; fallback sans-serif tersedia jika koneksi font tidak tersedia. Discord tetap membutuhkan login dan akses ke server/channel. Validasi lokal tidak membuktikan deployment sudah live; push repository dan aktivasi GitHub Pages tetap diperlukan.

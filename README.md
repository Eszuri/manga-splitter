# 🖼️ Cut Image — Manga/Webtoon Splitter

> Memotong gambar panjang (web manga/manga long strip) secara otomatis menjadi beberapa bagian.

## 📸 Fitur

- **Whitespace Detection** — Mendeteksi garis pemisah putih antar panel manga secara otomatis
- **Fixed Ratio** — Memotong dengan rasio tinggi tetap (lebar × faktor)
- **Output JPG/PNG** — Pilih format output sesuai kebutuhan
- **Manga Viewer** — Halaman HTML untuk melihat hasil potongan langsung di browser

## 🛠️ Persyaratan

- Python 3.8+
- Library:
  ```bash
  pip install Pillow numpy
  ```

## 🚀 Cara Penggunaan

### CLI (Command Line)

```bash
# Whitespace detection (default)
python main.py manga.png

# Fixed ratio
python main.py manga.png -m fixed --factor 1.5

# Tentukan folder output & format
python main.py manga.png -o output_folder --format png

# Atur toleransi warna (0=putih murni, maks ~60)
python main.py manga.png -t 25

# Atur tinggi minimum potongan (px)
python main.py manga.png --min-height 300
```

### Opsi Lengkap

| Flag | Deskripsi | Default |
|------|-----------|---------|
| `input` | Path gambar input (PNG/JPG/WebP) | *wajib* |
| `-o, --output` | Folder output | `<nama_file>_split/` |
| `-m, --method` | Metode deteksi: `whitespace` atau `fixed` | `whitespace` |
| `-t, --tolerance` | Toleransi warna untuk whitespace (0-60) | `15` |
| `--min-height` | Tinggi minimum potongan (px) | `200` |
| `--factor` | Faktor tinggi untuk metode fixed | `1.4` |
| `--format` | Format output: `jpg` atau `png` | `jpg` |
| `--quality` | Kualitas JPEG (1-100) | `92` |

### Contoh Output

```
[+] Membaca gambar: manga.png
    Ukuran: 800×4500 px
[+] Metode: Whitespace Detection (toleransi=15, min_tinggi=200px)
[+] Ditemukan 5 potongan. Menyimpan ke: manga_split
    [001] y=0–892    → halaman_001.jpg
    [002] y=893–1785 → halaman_002.jpg
    [003] y=1786–2678→ halaman_003.jpg
    [004] y=2679–3571→ halaman_004.jpg
    [005] y=3572–4500→ halaman_005.jpg

[✓] Selesai! 5 potongan tersimpan di: manga_split
```

## 🌐 Manga Viewer

Buka `index.html` di browser untuk melihat hasil potongan:

1. Buka `index.html` di browser
2. Klik **📁 Buka Folder**
3. Pilih folder hasil split (misalnya `manga_split/`)
4. Semua gambar akan ditampilkan secara berurutan

## 📁 Struktur Project

```
cut image/
├── main.py        # Script utama untuk memotong gambar
├── index.html     # Manga viewer (buka di browser)
├── image.png      # Gambar contoh
└── README.md      # Dokumentasi ini
```

## ⚙️ Konfigurasi Default

```python
DEFAULT_METHOD      = "whitespace"   # "whitespace" | "fixed"
DEFAULT_TOLERANCE   = 15             # 0=putih murni, maks ~60
DEFAULT_MIN_HEIGHT  = 200            # tinggi minimum potongan (px)
DEFAULT_FACTOR      = 1.4            # untuk fixed: tinggi = lebar × factor
OUTPUT_FORMAT       = "jpg"          # "jpg" | "png"
JPEG_QUALITY        = 92             # kualitas JPEG (1-100)
```

## 💡 Tips

- **Tidak ada potongan?** Coba naikkan toleransi (`-t 30`) atau turunkan min_height (`--min-height 100`)
- **Potongan terlalu banyak?** Turunkan toleransi (`-t 5`) atau naikkan min_height (`--min-height 400`)
- **Gambar tidak putih?** Naikkan toleransi untuk menyesuaikan warna pemisah
- **Manga panjang tanpa garis putih?** Gunakan metode fixed (`-m fixed`)

## 📄 Lisensi

Project ini untuk penggunaan pribadi.

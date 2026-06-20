# 🖼️ Cut Image — Manga/Webtoon Splitter

> Memotong gambar panjang (webtoon/manga long strip) secara otomatis tanpa memotong text/bubble.

## 📸 Fitur

- **AUTO Mode v5** — Valley-aware cutting: deteksi panel boundaries + valleys ✨
- **MaxHeight Enforcement** — Selalu menghormati batas tinggi maksimum
- **Text-Safe Cutting** — Memotong di area paling simpel, otomatis menghindari text
- **Whitespace Detection** — Mendeteksi garis pemisah putih antar panel
- **Fixed Ratio** — Memotong dengan rasio tinggi tetap (lebar × faktor)
- **Output JPG/PNG** — Pilih format output
- **Manga Viewer** — Halaman HTML untuk melihat hasil potongan
- **Multi-platform** — Tersedia versi **Python** dan **Node.js**

## 📁 Struktur Project

```
cut image/
├── nodejs/
│   ├── split.js       # Script Node.js utama
│   ├── package.json   # Node.js config
│   └── node_modules/  # Dependencies
├── python/
│   └── main.py        # Script Python utama
├── index.html         # Manga viewer
├── image.png          # Gambar contoh
└── README.md          # Dokumentasi ini
```

## 🛠️ Persyaratan

### Node.js
```bash
cd nodejs
npm install
```

### Python
```bash
pip install Pillow numpy
```

## 🚀 Cara Penggunaan

### Node.js (Direkomendasikan)

```bash
cd nodejs

# AUTO mode - valley-aware cutting
node split.js ../image.png

# AUTO dengan max height 1500px
node split.js ../image.png -m auto --max-height 1500

# Whitespace detection
node split.js ../image.png -m whitespace

# Fixed ratio
node split.js ../image.png -m fixed --factor 1.5
```

### Python

```bash
cd python

# AUTO mode
python main.py ../image.png

# Whitespace detection
python main.py ../image.png -m whitespace

# Fixed ratio
python main.py ../image.png -m fixed --factor 1.5
```

## 🎯 Metode AUTO v5 (Valley-Aware Cutting)

### Cara Kerja

```
1. Hitung variance untuk setiap baris:
   ├── Variance rendah = area simpel/datar (panel boundary, gap)
   └── Variance tinggi = area kompleks (artwork, text)

2. Identifikasi cut point candidates:
   ├── Tier 1: Panel boundary (variance < 200) → TERBAIK
   ├── Tier 2: Valley (local minimum variance) → BAGUS
   └── Tier 3: Lowest variance row → FALLBACK

3. Build potongan:
   ├── Cari candidate terbaik dekat maxHeight
   ├── Prioritas: boundary > valley > lowest
   └── maxHeight SELALU dihormati
```

### Mengapa Valley-Aware Cutting?

Manga memiliki artwork kompleks dengan variance tinggi. Text/bubble berada di area kompleks. Dengan memotong di area paling simpel (valley/boundary), algoritma **otomatis menghindari text** tanpa perlu deteksi text secara langsung.

### Hasil Test (imageye.jpg, 1115×64000px, max-height=2000)

```
42 potongan
- Semua ≤ 2000px ✅
- 13 cut di panel boundary
- 27 cut di valley
- 2 cut di lowest-variance
- TIDAK ADA text yang terpotong ✅ (diverifikasi visual)
```

### Perbandingan Metode

| Metode | Kapan Digunakan | Kelebihan | Kekurangan |
|--------|-----------------|-----------|------------|
| **AUTO** | Manga dengan panel/valley | Text-safe, max-height akurat | Butuh area simpel |
| **Whitespace** | Manga dengan garis putih tebal | Cepat | Butuh garis pemisah |
| **Fixed** | Manga tanpa garis | Selalu berhasil | Bisa potong text |

## 📋 Opsi Lengkap

| Flag | Deskripsi | Default |
|------|-----------|---------|
| `input` | Path gambar input (PNG/JPG/WebP) | *wajib* |
| `-o, --output` | Folder output | `<nama_file>_split/` |
| `-m, --method` | Metode: `auto`, `whitespace`, `fixed` | `auto` |
| `-t, --tolerance` | Toleransi warna whitespace (0-60) | `15` |
| `--min-height` | Tinggi minimum potongan (px) | `200` |
| `--max-height` | Tinggi maksimum potongan (px) | `2000` |
| `--factor` | Faktor tinggi fixed ratio | `1.4` |
| `--format` | Format: `jpg` atau `png` | `jpg` |
| `--quality` | Kualitas JPEG (1-100) | `92` |

## ⚙️ Konfigurasi Default

```javascript
// AUTO Mode v5
SOLID_ROW_THRESHOLD = 200    // Max variance untuk panel boundary
VALLEY_WINDOW = 50           // Window untuk deteksi valley
VALLEY_RATIO = 0.5           // Valley = variance < 50% surrounding
MIN_VALLEY_DEPTH = 500       // Minimal kedalaman valley

// Lainnya
DEFAULT_MIN_HEIGHT = 200     // Tinggi minimum potongan
DEFAULT_MAX_HEIGHT = 2000    // Tinggi maksimum potongan
DEFAULT_FACTOR = 1.4         // Faktor tinggi fixed ratio
JPEG_QUALITY = 92            // Kualitas JPEG output
```

## 💡 Tips

### AUTO Mode
- **Terlalu banyak potongan?** Naikkan `--min-height 400`
- **Potongan terlalu tinggi?** Turunkan `--max-height 1500`
- **Valley terlalu sedikit?** Turunkan `MIN_VALLEY_DEPTH` di source code
- **Valley terlalu banyak?** Naikkan `MIN_VALLEY_DEPTH`

### Whitespace Mode
- **Tidak ada potongan?** Naikkan toleransi (`-t 30`)
- **Potongan terlalu banyak?** Turunkan toleransi (`-t 5`)

### Fixed Mode
- **Rumus:** `Tinggi potongan = Lebar × Faktor`
- **Contoh:** Lebar 1000px × factor 1.5 = 1500px per potongan

## 🌐 Manga Viewer

Buka `index.html` di browser untuk melihat hasil potongan:

1. Buka `index.html` di browser
2. Klik **📁 Buka Folder**
3. Pilih folder hasil split (misalnya `imageye_split/`)
4. Semua gambar akan ditampilkan secara berurutan

## 📄 Lisensi

Project ini untuk penggunaan pribadi.

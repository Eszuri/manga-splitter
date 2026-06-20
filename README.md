# 🖼️ Cut Image — Manga/Webtoon Splitter

> Memotong gambar panjang (webtoon/manga long strip) secara otomatis menjadi beberapa bagian.

## 📸 Fitur

- **AUTO Mode** — Deteksi text/bubble otomatis, hindari saat cut ✨
- **Whitespace Detection** — Mendeteksi garis pemisah putih antar panel manga
- **Fixed Ratio** — Memotong dengan rasio tinggi tetap (lebar × faktor)
- **Output JPG/PNG** — Pilih format output sesuai kebutuhan
- **Manga Viewer** — Halaman HTML untuk melihat hasil potongan langsung di browser
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
├── index.html         # Manga viewer (buka di browser)
├── image.png          # Gambar contoh
├── image_split/       # Hasil split
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

# AUTO mode - deteksi text/bubble, hindari saat cut
node split.js ../image.png

# AUTO dengan max height 1500px
node split.js ../image.png -m auto --max-height 1500

# Whitespace detection
node split.js ../image.png -m whitespace

# Fixed ratio
node split.js ../image.png -m fixed --factor 1.5

# Tentukan folder output & format
node split.js ../image.png -o ../output_folder --format png
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

## 🎯 Metode AUTO (Baru!)

Metode **AUTO** mendeteksi area text dan bubble, lalu mencari titik potong **aman** yang tidak memotong konten penting.

### Cara Kerja

```
1. Analisis per baris:
   ├── Variance warna → deteksi text/gambar kompleks
   └── Edge detection → deteksi tepi bubble/dialog

2. Bangun peta keamanan:
   ├── 🟢 Hijau = aman (area kosong/gap)
   └── 🔴 Merah = berbahaya (text/bubble)

3. Cari titik potong optimal:
   └── Potong HANYA di area hijau (aman)
```

### Perbandingan Metode

| Metode | Kapan Digunakan | Kelebihan | Kekurangan |
|--------|-----------------|-----------|------------|
| **AUTO** | Manga dengan text/bubble | Hindari text otomatis | Lebih lambat |
| **Whitespace** | Manga dengan garis putih | Cepat & akurat | Butuh garis pemisah |
| **Fixed** | Manga tanpa garis | Selalu berhasil | Tidak deteksi konten |

## 📋 Opsi Lengkap

| Flag | Deskripsi | Default |
|------|-----------|---------|
| `input` | Path gambar input (PNG/JPG/WebP) | *wajib* |
| `-o, --output` | Folder output | `<nama_file>_split/` |
| `-m, --method` | Metode: `auto`, `whitespace`, atau `fixed` | `auto` |
| `-t, --tolerance` | Toleransi warna untuk whitespace (0-60) | `15` |
| `--min-height` | Tinggi minimum potongan (px) | `200` |
| `--max-height` | Tinggi maksimum potongan (px) | `2000` |
| `--factor` | Faktor tinggi untuk fixed ratio | `1.4` |
| `--format` | Format output: `jpg` atau `png` | `jpg` |
| `--quality` | Kualitas JPEG (1-100) | `92` |

## 💡 Tips

### AUTO Mode
- **Terlalu banyak potongan?** Naikkan `--min-height 400`
- **Potongan terlalu tinggi?** Turunkan `--max-height 1500`
- **Text masih terpotong?** Turunkan threshold di source code (TEXT_VARIANCE_THRESHOLD)

### Whitespace Mode
- **Tidak ada potongan?** Naikkan toleransi (`-t 30`)
- **Potongan terlalu banyak?** Turunkan toleransi (`-t 5`)

### Fixed Mode
- **Rumus:** `Tinggi potongan = Lebar × Faktor`
- **Contoh:** Lebar 1000px × factor 1.5 = 1500px per potongan

## ⚙️ Konfigurasi Default

```javascript
// AUTO Mode
TEXT_VARIANCE_THRESHOLD = 35   // Threshold deteksi text
SAFE_ZONE_MIN = 5             // Minimal baris aman untuk cut
DEFAULT_MIN_HEIGHT = 200       // Tinggi minimum potongan
DEFAULT_MAX_HEIGHT = 2000      // Tinggi maksimum potongan

// Lainnya
DEFAULT_TOLERANCE = 15         // Toleransi warna whitespace
DEFAULT_FACTOR = 1.4           // Faktor tinggi fixed ratio
JPEG_QUALITY = 92              // Kualitas JPEG output
```

## 🌐 Manga Viewer

Buka `index.html` di browser untuk melihat hasil potongan:

1. Buka `index.html` di browser
2. Klik **📁 Buka Folder**
3. Pilih folder hasil split (misalnya `image_split/`)
4. Semua gambar akan ditampilkan secara berurutan

## 📄 Lisensi

Project ini untuk penggunaan pribadi.

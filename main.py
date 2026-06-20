"""
manga_splitter.py
Memotong gambar panjang (webtoon/manga long strip) secara otomatis
menggunakan dua metode: whitespace detection atau fixed ratio.

Kebutuhan: pip install Pillow
"""

import os
import sys
from pathlib import Path
from PIL import Image
import numpy as np


# ─── CONFIG DEFAULT ────────────────────────────────────────────────
DEFAULT_METHOD      = "whitespace"   # "whitespace" | "fixed"
DEFAULT_TOLERANCE   = 15             # 0=putih murni, maks ~60
DEFAULT_MIN_HEIGHT  = 200            # tinggi minimum potongan (px)
DEFAULT_FACTOR      = 1.4            # untuk fixed: tinggi = lebar × factor
OUTPUT_FORMAT       = "jpg"          # "jpg" | "png"
JPEG_QUALITY        = 92             # kualitas JPEG (1-100)
# ────────────────────────────────────────────────────────────────────


def load_image(path: str) -> Image.Image:
    img = Image.open(path).convert("RGB")
    return img


def image_to_array(img: Image.Image) -> np.ndarray:
    return np.array(img)


def find_cuts_whitespace(arr: np.ndarray, tolerance: int = 15, min_height: int = 200):
    """
    Scan gambar baris per baris dari atas ke bawah.
    Tandai baris yang seluruh pikselnya berwarna solid (toleransi warna tertentu).
    Kelompokkan baris solid yang berurutan → titik potong di tengah kelompok.
    Kembalikan list tuple (from_y, to_y) per potongan.
    """
    h, w, _ = arr.shape
    solid_rows = []

    for y in range(h):
        row = arr[y]                  # shape (w, 3)
        ref = row[0].astype(int)      # pixel pertama sebagai referensi
        diff = np.abs(row.astype(int) - ref)
        if diff.max() <= tolerance:
            solid_rows.append(y)

    solid_set = set(solid_rows)
    cuts = []
    start = 0
    i = 0

    while i < len(solid_rows):
        solid_start = solid_rows[i]
        # Kumpulkan baris solid yang berurutan
        j = i
        while j + 1 < len(solid_rows) and solid_rows[j + 1] == solid_rows[j] + 1:
            j += 1
        solid_end = solid_rows[j]
        cut_y = (solid_start + solid_end) // 2

        if cut_y - start >= min_height:
            cuts.append((start, cut_y))
            start = solid_end + 1

        i = j + 1

    # Sisa bawah
    if h - start >= min_height:
        cuts.append((start, h))

    return cuts


def find_cuts_fixed(arr: np.ndarray, factor: float = 1.4):
    """
    Potong gambar dengan tinggi tetap = lebar × factor.
    """
    h, w, _ = arr.shape
    slice_h = max(1, int(w * factor))
    cuts = []
    y = 0
    while y < h:
        cuts.append((y, min(y + slice_h, h)))
        y += slice_h
    return cuts


def split_image(
    input_path: str,
    output_dir: str = None,
    method: str = DEFAULT_METHOD,
    tolerance: int = DEFAULT_TOLERANCE,
    min_height: int = DEFAULT_MIN_HEIGHT,
    factor: float = DEFAULT_FACTOR,
    output_format: str = OUTPUT_FORMAT,
    jpeg_quality: int = JPEG_QUALITY,
) -> list[str]:
    """
    Fungsi utama. Mengembalikan list path file output yang dihasilkan.
    """
    input_path = Path(input_path)
    if not input_path.exists():
        raise FileNotFoundError(f"File tidak ditemukan: {input_path}")

    if output_dir is None:
        output_dir = input_path.parent / (input_path.stem + "_split")
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    print(f"[+] Membaca gambar: {input_path}")
    img = load_image(str(input_path))
    arr = image_to_array(img)
    h, w = arr.shape[:2]
    print(f"    Ukuran: {w}×{h} px")

    if method == "whitespace":
        print(f"[+] Metode: Whitespace Detection (toleransi={tolerance}, min_tinggi={min_height}px)")
        cuts = find_cuts_whitespace(arr, tolerance=tolerance, min_height=min_height)
    elif method == "fixed":
        print(f"[+] Metode: Fixed Ratio (faktor={factor}, tinggi per potongan≈{int(w*factor)}px)")
        cuts = find_cuts_fixed(arr, factor=factor)
    else:
        raise ValueError(f"Metode tidak dikenal: {method}. Pilih 'whitespace' atau 'fixed'.")

    if not cuts:
        print("[!] Tidak ditemukan titik potong. Coba naikkan toleransi atau turunkan min_height.")
        return []

    print(f"[+] Ditemukan {len(cuts)} potongan. Menyimpan ke: {output_dir}")
    saved = []

    for idx, (y0, y1) in enumerate(cuts, start=1):
        crop = img.crop((0, y0, w, y1))
        ext = output_format.lower()
        fname = f"halaman_{str(idx).zfill(3)}.{ext}"
        fpath = output_dir / fname

        if ext in ("jpg", "jpeg"):
            crop.save(str(fpath), "JPEG", quality=jpeg_quality)
        else:
            crop.save(str(fpath), "PNG")

        saved.append(str(fpath))
        print(f"    [{idx:03d}] y={y0}–{y1} → {fname}")

    print(f"\n[✓] Selesai! {len(saved)} potongan tersimpan di: {output_dir}")
    return saved


# ─── CLI ────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(
        description="Potong gambar panjang (manga/webtoon) secara otomatis."
    )
    parser.add_argument("input", help="Path gambar input (PNG/JPG/WebP)")
    parser.add_argument("-o", "--output", default=None, help="Folder output (default: <nama_file>_split/)")
    parser.add_argument("-m", "--method", default=DEFAULT_METHOD, choices=["whitespace", "fixed"],
                        help="Metode deteksi (default: whitespace)")
    parser.add_argument("-t", "--tolerance", type=int, default=DEFAULT_TOLERANCE,
                        help="Toleransi warna untuk whitespace (0-60, default: 15)")
    parser.add_argument("--min-height", type=int, default=DEFAULT_MIN_HEIGHT,
                        help="Tinggi minimum potongan px (default: 200)")
    parser.add_argument("--factor", type=float, default=DEFAULT_FACTOR,
                        help="Faktor tinggi untuk metode fixed (default: 1.4)")
    parser.add_argument("--format", default=OUTPUT_FORMAT, choices=["jpg", "png"],
                        help="Format output (default: jpg)")
    parser.add_argument("--quality", type=int, default=JPEG_QUALITY,
                        help="Kualitas JPEG 1-100 (default: 92)")

    args = parser.parse_args()

    split_image(
        input_path=args.input,
        output_dir=args.output,
        method=args.method,
        tolerance=args.tolerance,
        min_height=args.min_height,
        factor=args.factor,
        output_format=args.format,
        jpeg_quality=args.quality,
    )
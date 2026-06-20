"""
manga_splitter.py v5
Memotong gambar panjang (webtoon/manga long strip) secara otomatis
menggunakan "valley-aware cutting" - deteksi panel boundaries + valleys.

Kebutuhan: pip install Pillow numpy
"""
import os
import sys
from pathlib import Path

import numpy as np
from PIL import Image


# ─── CONFIG DEFAULT ────────────────────────────────────────────────
DEFAULT_METHOD      = "auto"
DEFAULT_TOLERANCE   = 15
DEFAULT_MIN_HEIGHT  = 200
DEFAULT_MAX_HEIGHT  = 2000
DEFAULT_FACTOR      = 1.4
OUTPUT_FORMAT       = "jpg"
JPEG_QUALITY        = 92

# AUTO MODE
SOLID_ROW_THRESHOLD = 200      # variance < ini = panel boundary
VALLEY_WINDOW       = 50       # Window untuk deteksi valley (px)
VALLEY_RATIO        = 0.5      # Valley = variance < 50% dari surrounding
MIN_VALLEY_DEPTH    = 500      # Minimal kedalaman valley (variance diff)
# ────────────────────────────────────────────────────────────────────


def load_image(path: str) -> Image.Image:
    return Image.open(path).convert("RGB")


def image_to_array(img: Image.Image) -> np.ndarray:
    return np.array(img)


# ─── VARIANCE COMPUTATION ──────────────────────────────────────────

def compute_all_variances(arr) -> np.ndarray:
    """Hitung variance untuk setiap baris"""
    h, w, _ = arr.shape
    variances = np.zeros(h, dtype=np.float32)
    for y in range(h):
        row = arr[y].astype(float)
        avg = row.mean(axis=0)
        variance = ((row - avg) ** 2).mean()
        variances[y] = variance
    return variances


# ─── CUT POINT DETECTION ───────────────────────────────────────────

def _avg_range(variances, start, end):
    """Rata-rata variance dalam rentang [start, end]"""
    start = max(0, start)
    end = min(len(variances) - 1, end)
    if start > end:
        return 0
    return variances[start:end + 1].mean()


def find_best_cut_point(variances, from_y, to_y, height):
    """
    Cari cut point candidates dalam rentang [from_y, to_y]:
    - Tier 1: Panel boundary (variance < SOLID_ROW_THRESHOLD) → score tinggi
    - Tier 2: Valley (local minimum dengan kedalaman signifikan) → score sedang
    - Tier 3: Lowest variance row → score rendah
    """
    candidates = []
    y = from_y
    while y <= to_y and y < height:
        v = variances[y]

        # Tier 1: Panel boundary
        if v < SOLID_ROW_THRESHOLD:
            seg_start = y
            while seg_start > from_y and variances[seg_start - 1] < SOLID_ROW_THRESHOLD:
                seg_start -= 1
            seg_end = y
            while seg_end < to_y and seg_end < height - 1 and variances[seg_end + 1] < SOLID_ROW_THRESHOLD:
                seg_end += 1
            mid = (seg_start + seg_end) // 2
            candidates.append({"y": mid, "score": 1000, "type": "boundary", "variance": v})
            y = seg_end + 1
            continue

        # Tier 2: Valley (local minimum)
        if y > VALLEY_WINDOW and y < height - VALLEY_WINDOW:
            left_avg = _avg_range(variances, y - VALLEY_WINDOW, y - 1)
            right_avg = _avg_range(variances, y + 1, y + VALLEY_WINDOW)
            surrounding_avg = (left_avg + right_avg) / 2

            if v < surrounding_avg * VALLEY_RATIO and (surrounding_avg - v) > MIN_VALLEY_DEPTH:
                v_start = y
                while v_start > from_y and variances[v_start - 1] < surrounding_avg * VALLEY_RATIO:
                    v_start -= 1
                v_end = y
                while v_end < to_y and v_end < height - 1 and variances[v_end + 1] < surrounding_avg * VALLEY_RATIO:
                    v_end += 1
                mid = (v_start + v_end) // 2
                depth = surrounding_avg - variances[mid]
                candidates.append({"y": mid, "score": 500 + min(depth / 10, 200), "type": "valley", "variance": v})
                y = v_end + 1
                continue

        y += 1

    if not candidates:
        # Tier 3: Row dengan variance terendah
        search_end = min(to_y, height - 1)
        if from_y <= search_end:
            min_idx = int(np.argmin(variances[from_y:search_end + 1])) + from_y
            candidates.append({"y": min_idx, "score": 100, "type": "lowest", "variance": variances[min_idx]})

    return candidates


# ─── AUTO CUTTING v5 ───────────────────────────────────────────────

def find_cuts_auto(arr, min_height=200, max_height=2000):
    """
    Valley-aware cutting:
    1. Hitung variance per baris
    2. Panel boundary = variance sangat rendah
    3. Valley = local minimum variance
    4. Cut di boundary/valley terbaik dekat maxHeight
    """
    h, w, _ = arr.shape
    print(f"    Menghitung variance per baris...")
    variances = compute_all_variances(arr)

    solid_count = (variances < SOLID_ROW_THRESHOLD).sum()
    print(f"    Solid rows: {solid_count}/{h} ({(solid_count / h * 100):.1f}%)")

    cuts = []
    current_y = 0
    boundary_count = 0
    valley_count = 0
    lowest_count = 0

    while current_y < h:
        remaining = h - current_y

        if remaining <= min_height:
            if cuts:
                cuts[-1] = (cuts[-1][0], h)
            else:
                cuts.append((current_y, h))
            break

        target = min(current_y + max_height, h)
        search_from = current_y + min_height
        search_to = min(target, h - 1)

        candidates = find_best_cut_point(variances, search_from, search_to, h)

        # Sort: tier (lower=better), then closeness to target
        candidates.sort(key=lambda c: (
            1 if c["score"] >= 1000 else (2 if c["score"] >= 500 else 3),
            abs(c["y"] - target)
        ))

        best = candidates[0]

        if best["type"] == "boundary":
            boundary_count += 1
        elif best["type"] == "valley":
            valley_count += 1
        else:
            lowest_count += 1

        cuts.append((current_y, best["y"]))
        current_y = best["y"]

    print(f"    Cut points: {boundary_count} boundary, {valley_count} valley, {lowest_count} lowest-variance")
    return cuts


# ─── WHITESPACE & FIXED ────────────────────────────────────────────

def find_cuts_whitespace(arr, tolerance=15, min_height=200):
    h, w, _ = arr.shape
    solid_rows = []
    for y in range(h):
        row = arr[y]
        ref = row[0].astype(int)
        diff = np.abs(row.astype(int) - ref)
        if diff.max() <= tolerance:
            solid_rows.append(y)

    cuts = []
    start = 0
    i = 0
    while i < len(solid_rows):
        s = solid_rows[i]
        j = i
        while j + 1 < len(solid_rows) and solid_rows[j + 1] == solid_rows[j] + 1:
            j += 1
        e = solid_rows[j]
        cut_y = (s + e) // 2
        if cut_y - start >= min_height:
            cuts.append((start, cut_y))
            start = e + 1
        i = j + 1

    if h - start >= min_height:
        cuts.append((start, h))
    return cuts


def find_cuts_fixed(arr, factor=1.4):
    h, w, _ = arr.shape
    slice_h = max(1, int(w * factor))
    cuts = []
    y = 0
    while y < h:
        cuts.append((y, min(y + slice_h, h)))
        y += slice_h
    return cuts


# ─── MAIN ──────────────────────────────────────────────────────────

def split_image(
    input_path: str,
    output_dir: str = None,
    method: str = DEFAULT_METHOD,
    tolerance: int = DEFAULT_TOLERANCE,
    min_height: int = DEFAULT_MIN_HEIGHT,
    max_height: int = DEFAULT_MAX_HEIGHT,
    factor: float = DEFAULT_FACTOR,
    output_format: str = OUTPUT_FORMAT,
    jpeg_quality: int = JPEG_QUALITY,
) -> list[str]:
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
        print(f"[+] Metode: Whitespace Detection")
        cuts = find_cuts_whitespace(arr, tolerance=tolerance, min_height=min_height)
    elif method == "fixed":
        print(f"[+] Metode: Fixed Ratio (faktor={factor})")
        cuts = find_cuts_fixed(arr, factor=factor)
    elif method == "auto":
        print(f"[+] Metode: AUTO v5 (valley-aware cutting)")
        print(f"    Tinggi: min={min_height}px, max={max_height}px")
        cuts = find_cuts_auto(arr, min_height=min_height, max_height=max_height)
    else:
        raise ValueError(f"Metode tidak dikenal: {method}")

    if not cuts:
        print("[!] Tidak ditemukan titik potong.")
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
        print(f"    [{idx:03d}] y={y0}–{y1} (tinggi={y1-y0}px) → {fname}")

    print(f"\n[✓] Selesai! {len(saved)} potongan tersimpan di: {output_dir}")
    return saved


# ─── CLI ────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Potong gambar manga/webtoon otomatis.")
    parser.add_argument("input", help="Path gambar input")
    parser.add_argument("-o", "--output", default=None, help="Folder output")
    parser.add_argument("-m", "--method", default=DEFAULT_METHOD, choices=["whitespace", "fixed", "auto"])
    parser.add_argument("-t", "--tolerance", type=int, default=DEFAULT_TOLERANCE)
    parser.add_argument("--min-height", type=int, default=DEFAULT_MIN_HEIGHT)
    parser.add_argument("--max-height", type=int, default=DEFAULT_MAX_HEIGHT)
    parser.add_argument("--factor", type=float, default=DEFAULT_FACTOR)
    parser.add_argument("--format", default=OUTPUT_FORMAT, choices=["jpg", "png"])
    parser.add_argument("--quality", type=int, default=JPEG_QUALITY)
    args = parser.parse_args()

    split_image(
        input_path=args.input, output_dir=args.output, method=args.method,
        tolerance=args.tolerance, min_height=args.min_height, max_height=args.max_height,
        factor=args.factor, output_format=args.format, jpeg_quality=args.quality,
    )

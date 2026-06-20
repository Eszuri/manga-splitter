#!/usr/bin/env node
/**
 * manga-splitter.js — AUTO MODE
 * Memotong gambar panjang (webtoon/manga) dengan method AUTO yang:
 *   - Bebas cut di manapun (0-2000px tinggi)
 *   - Deteksi text & bubble → TIDAK cut di area tersebut
 *   - Hanya cut di area "aman" (gap antar konten)
 *
 * Dependencies: npm install sharp
 */

const sharp = require("sharp");
const path = require("path");
const fs = require("fs");

// ─── CONFIG DEFAULT ────────────────────────────────────────────────
const DEFAULT_METHOD = "auto"; // "whitespace" | "fixed" | "auto"
const DEFAULT_TOLERANCE = 15;
const DEFAULT_MIN_HEIGHT = 200;
const DEFAULT_MAX_HEIGHT = 2000;
const DEFAULT_FACTOR = 1.4;
const OUTPUT_FORMAT = "jpg";
const JPEG_QUALITY = 92;

// AUTO MODE: Threshold untuk deteksi text/bubble
const TEXT_VARIANCE_THRESHOLD = 35; // Baris dengan variance > ini = ada text
const BUBBLE_SCAN_MARGIN = 30; // Margin horizontal untuk deteksi bubble
const SAFE_ZONE_THRESHOLD = 8; // Max "noise" di area potong (semakin kecil = semakin aman)
const MIN_SAFE_ZONE = 5; // Minimal baris aman untuk cut
// ────────────────────────────────────────────────────────────────────

/**
 * Parse CLI arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    printHelp();
    process.exit(0);
  }

  const opts = {
    input: null,
    output: null,
    method: DEFAULT_METHOD,
    tolerance: DEFAULT_TOLERANCE,
    minHeight: DEFAULT_MIN_HEIGHT,
    maxHeight: DEFAULT_MAX_HEIGHT,
    factor: DEFAULT_FACTOR,
    format: OUTPUT_FORMAT,
    quality: JPEG_QUALITY,
  };

  let positional = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("-")) {
      switch (args[i]) {
        case "-o": case "--output": opts.output = args[++i]; break;
        case "-m": case "--method": opts.method = args[++i]; break;
        case "-t": case "--tolerance": opts.tolerance = parseInt(args[++i], 10); break;
        case "--min-height": opts.minHeight = parseInt(args[++i], 10); break;
        case "--max-height": opts.maxHeight = parseInt(args[++i], 10); break;
        case "--factor": opts.factor = parseFloat(args[++i]); break;
        case "--format": opts.format = args[++i]; break;
        case "--quality": opts.quality = parseInt(args[++i], 10); break;
        default:
          console.error(`[!] Flag tidak dikenal: ${args[i]}`);
          process.exit(1);
      }
    } else {
      positional.push(args[i]);
    }
  }

  if (positional.length === 0) {
    console.error("[!] Input file wajib. Gunakan --help untuk bantuan.");
    process.exit(1);
  }

  opts.input = positional[0];
  return opts;
}

/**
 * Print help message
 */
function printHelp() {
  console.log(`
manga-splitter — Potong gambar panjang dengan AUTO detection (hindari text/bubble)

PENGGUNAAN:
  node split.js <input> [opsi]

METODE:
  -m auto      Otomatis deteksi text/bubble, cut di area aman (default)
  -m whitespace  Deteksi garis putih kosong
  -m fixed      Potong dengan rasio tetap (tinggi = lebar × factor)

OPSI UMUM:
  -o, --output       Folder output (default: <nama>_split/)
  -t, --tolerance    Toleransi warna untuk whitespace (default: 15)
  --format           Format output: jpg | png (default: jpg)
  --quality          Kualitas JPEG 1-100 (default: 92)

OPSI METODE WHITESPACE/FIXED:
  --min-height       Tinggi minimum potongan px (default: 200)
  --factor           Faktor tinggi untuk fixed (default: 1.4)

OPSI METODE AUTO:
  --min-height       Tinggi minimum potongan px (default: 200)
  --max-height       Tinggi maksimum potongan px (default: 2000)

CONTOH:
  node split.js manga.png
  node split.js manga.png -m auto --max-height 1500
  node split.js manga.png -m fixed --factor 1.5
  node split.js manga.png -m whitespace -t 25
  `);
}

/**
 * Load image and extract raw pixel data
 */
async function loadImage(inputPath) {
  const image = sharp(inputPath);
  const metadata = await image.metadata();
  const { width, height, channels } = metadata;
  const { data } = await image.raw().toBuffer({ resolveWithObject: true });
  return { image, metadata, data: Buffer.from(data), width, height, channels };
}

// ─── AUTO MODE: TEXT & BUBBLE DETECTION ────────────────────────────

/**
 * Hitung variance warna per baris
 * Variance tinggi = ada text/gambar kompleks
 * Variance rendah = area kosong / background solid
 */
function calculateRowVariance(pixelData, y, width, channels) {
  const rowOffset = y * width * channels;

  // Hitung rata-rata RGB
  let sumR = 0, sumG = 0, sumB = 0;
  for (let x = 0; x < width; x++) {
    const offset = rowOffset + x * channels;
    sumR += pixelData[offset];
    sumG += pixelData[offset + 1];
    sumB += pixelData[offset + 2];
  }
  const avgR = sumR / width;
  const avgG = sumG / width;
  const avgB = sumB / width;

  // Hitung variance
  let varR = 0, varG = 0, varB = 0;
  for (let x = 0; x < width; x++) {
    const offset = rowOffset + x * channels;
    varR += (pixelData[offset] - avgR) ** 2;
    varG += (pixelData[offset + 1] - avgG) ** 2;
    varB += (pixelData[offset + 2] - avgB) ** 2;
  }

  return (varR + varG + varB) / (width * 3);
}

/**
 * Deteksi apakah baris ini mengandung text atau bubble
 * Menggunakan kombinasi:
 *  1. Variance tinggi = kompleks (text, gambar)
 *  2. Edge detection = ada garis tepi (bubble border)
 */
function isRowTextOrBubble(pixelData, y, width, channels, threshold) {
  const variance = calculateRowVariance(pixelData, y, width, channels);

  // Cek apakah ada edge mendadak (perubahan warna tajam)
  let edgeCount = 0;
  const rowOffset = y * width * channels;

  for (let x = 1; x < width; x++) {
    const prevOffset = rowOffset + (x - 1) * channels;
    const currOffset = rowOffset + x * channels;

    const diffR = Math.abs(pixelData[currOffset] - pixelData[prevOffset]);
    const diffG = Math.abs(pixelData[currOffset + 1] - pixelData[prevOffset + 1]);
    const diffB = Math.abs(pixelData[currOffset + 2] - pixelData[prevOffset + 2]);

    if (diffR + diffG + diffB > 80) {
      edgeCount++;
    }
  }

  // Rasio edge per lebar gambar
  const edgeRatio = edgeCount / width;

  // Text detection: variance tinggi ATAU banyak edge
  const isText = variance > threshold || edgeRatio > 0.3;

  return { isText, variance, edgeRatio };
}

/**
 * Bangun "peta keamanan" untuk setiap baris
 * true = aman (tidak ada text/bubble)
 * false = berbahaya (ada text/bubble)
 */
function buildSafetyMap(pixelData, width, height, channels, threshold) {
  const safetyMap = new Array(height);
  const varianceMap = new Float64Array(height);

  for (let y = 0; y < height; y++) {
    const { isText, variance } = isRowTextOrBubble(
      pixelData, y, width, channels, threshold
    );
    safetyMap[y] = !isText;
    varianceMap[y] = variance;
  }

  // Tambahkan margin keamanan di sekitar area text/bubble
  const margin = 5;
  const paddedSafetyMap = [...safetyMap];

  for (let y = 0; y < height; y++) {
    if (!safetyMap[y]) {
      // Tandai area sekitar sebagai tidak aman
      for (let dy = -margin; dy <= margin; dy++) {
        const ny = y + dy;
        if (ny >= 0 && ny < height) {
          paddedSafetyMap[ny] = false;
        }
      }
    }
  }

  return { safetyMap: paddedSafetyMap, varianceMap };
}

/**
 * Cari segmen-segmen aman yang cukup panjang untuk dijadikan potongan
 * Constraints:
 *  - Tinggi antara minHeight dan maxHeight
 *  - Seluruh segmen harus aman (tidak ada text/bubble)
 *  - Jika segmen terpotong text, cari titik terbaik di area aman
 */
function findSafeCuts(safetyMap, height, minHeight, maxHeight) {
  // Kelompokkan baris aman yang berurutan
  const safeSegments = [];
  let segStart = -1;

  for (let y = 0; y < height; y++) {
    if (safetyMap[y]) {
      if (segStart === -1) segStart = y;
    } else {
      if (segStart !== -1) {
        const segLen = y - segStart;
        if (segLen >= MIN_SAFE_ZONE) {
          safeSegments.push({ start: segStart, end: y - 1, length: segLen });
        }
        segStart = -1;
      }
    }
  }
  // Tambah segmen terakhir
  if (segStart !== -1) {
    const segLen = height - segStart;
    if (segLen >= MIN_SAFE_ZONE) {
      safeSegments.push({ start: segStart, end: height - 1, length: segLen });
    }
  }

  console.log(`    Area aman ditemukan: ${safeSegments.length} segmen`);

  // Sekarang bangun potongan dari segmen aman
  const cuts = [];
  let currentY = 0;

  while (currentY < height) {
    // Cari segmen aman berikutnya yang bisa dijadikan batas potong
    let bestCutY = null;

    // Prioritas: cari area aman yang memberikan potongan mendekati maxHeight
    const targetY = Math.min(currentY + maxHeight, height);

    // Cari segmen aman yang dekat target
    for (const seg of safeSegments) {
      if (seg.start >= currentY + minHeight && seg.start <= targetY) {
        // Potong di tengah segmen ini
        const cutCandidate = Math.floor((seg.start + seg.end) / 2);
        if (cutCandidate >= currentY + minHeight && cutCandidate <= targetY) {
          bestCutY = cutCandidate;
          break; // Ambil yang pertama ditemukan (sudah terurut)
        }
      }
    }

    // Jika tidak ada segmen aman di target, cari segmen terdekat setelah minHeight
    if (bestCutY === null) {
      for (const seg of safeSegments) {
        if (seg.start >= currentY + minHeight) {
          bestCutY = Math.floor((seg.start + seg.end) / 2);
          break;
        }
      }
    }

    // Jika masih tidak ada, potong di batas maksimum
    if (bestCutY === null || bestCutY >= height - MIN_SAFE_ZONE) {
      // Sisa gambar, ambil semua
      if (height - currentY >= MIN_SAFE_ZONE) {
        cuts.push([currentY, height]);
      }
      break;
    }

    cuts.push([currentY, bestCutY]);
    currentY = bestCutY;
  }

  return cuts;
}

// ─── EXISTING METHODS ──────────────────────────────────────────────

function findCutsWhitespace(pixelData, width, height, channels, tolerance, minHeight) {
  const solidRows = [];
  for (let y = 0; y < height; y++) {
    const rowOffset = y * width * channels;
    const refR = pixelData[rowOffset];
    const refG = pixelData[rowOffset + 1];
    const refB = pixelData[rowOffset + 2];
    let isSolid = true;

    for (let x = 1; x < width; x++) {
      const offset = rowOffset + x * channels;
      if (Math.abs(pixelData[offset] - refR) > tolerance ||
          Math.abs(pixelData[offset + 1] - refG) > tolerance ||
          Math.abs(pixelData[offset + 2] - refB) > tolerance) {
        isSolid = false;
        break;
      }
    }
    if (isSolid) solidRows.push(y);
  }

  const cuts = [];
  let start = 0;
  let i = 0;
  while (i < solidRows.length) {
    const solidStart = solidRows[i];
    let j = i;
    while (j + 1 < solidRows.length && solidRows[j + 1] === solidRows[j] + 1) j++;
    const solidEnd = solidRows[j];
    const cutY = Math.floor((solidStart + solidEnd) / 2);
    if (cutY - start >= minHeight) {
      cuts.push([start, cutY]);
      start = solidEnd + 1;
    }
    i = j + 1;
  }
  if (height - start >= minHeight) cuts.push([start, height]);
  return cuts;
}

function findCutsFixed(width, height, factor) {
  const sliceH = Math.max(1, Math.floor(width * factor));
  const cuts = [];
  let y = 0;
  while (y < height) {
    cuts.push([y, Math.min(y + sliceH, height)]);
    y += sliceH;
  }
  return cuts;
}

// ─── MAIN SPLIT FUNCTION ───────────────────────────────────────────

async function splitImage(opts) {
  const inputPath = path.resolve(opts.input);
  if (!fs.existsSync(inputPath)) {
    console.error(`[!] File tidak ditemukan: ${inputPath}`);
    process.exit(1);
  }

  let outputDir = opts.output;
  if (!outputDir) {
    const basename = path.basename(inputPath, path.extname(inputPath));
    outputDir = path.join(path.dirname(inputPath), basename + "_split");
  }
  outputDir = path.resolve(outputDir);

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  console.log(`[+] Membaca gambar: ${inputPath}`);
  const { data, width, height, channels } = await loadImage(inputPath);
  console.log(`    Ukuran: ${width}×${height} px`);

  let cuts = [];

  if (opts.method === "whitespace") {
    console.log(`[+] Metode: Whitespace Detection (toleransi=${opts.tolerance})`);
    cuts = findCutsWhitespace(data, width, height, channels, opts.tolerance, opts.minHeight);

  } else if (opts.method === "fixed") {
    console.log(`[+] Metode: Fixed Ratio (faktor=${opts.factor})`);
    cuts = findCutsFixed(width, height, opts.factor);

  } else if (opts.method === "auto") {
    console.log(`[+] Metode: AUTO (deteksi text/bubble, hindari saat cut)`);
    console.log(`    Tinggi: min=${opts.minHeight}px, max=${opts.maxHeight}px`);
    console.log(`    Membangun peta keamanan...`);

    // Bangun peta keamanan
    const { safetyMap, varianceMap } = buildSafetyMap(
      data, width, height, channels, TEXT_VARIANCE_THRESHOLD
    );

    // Hitung statistik
    let safeRows = 0;
    for (let y = 0; y < height; y++) {
      if (safetyMap[y]) safeRows++;
    }
    const safeRatio = ((safeRows / height) * 100).toFixed(1);
    console.log(`    Area aman: ${safeRows}/${height} baris (${safeRatio}%)`);

    // Cari titik potong aman
    cuts = findSafeCuts(safetyMap, height, opts.minHeight, opts.maxHeight);
  }

  if (cuts.length === 0) {
    console.log("[!] Tidak ditemukan titik potong yang aman.");
    return [];
  }

  console.log(`[+] Ditemukan ${cuts.length} potongan. Menyimpan ke: ${outputDir}`);

  const saved = [];
  const ext = opts.format.toLowerCase();

  for (let idx = 0; idx < cuts.length; idx++) {
    const [y0, y1] = cuts[idx];
    const fileName = `halaman_${String(idx + 1).padStart(3, "0")}.${ext}`;
    const filePath = path.join(outputDir, fileName);

    await sharp(inputPath)
      .extract({ left: 0, top: y0, width, height: y1 - y0 })
      .toFormat(ext === "jpg" ? "jpeg" : ext, { quality: opts.quality })
      .toFile(filePath);

    saved.push(filePath);
    console.log(`    [${String(idx + 1).padStart(3, "0")}] y=${y0}–${y1} (tinggi=${y1 - y0}px) → ${fileName}`);
  }

  console.log(`\n[✓] Selesai! ${saved.length} potongan tersimpan di: ${outputDir}`);
  return saved;
}

// ─── RUN ───────────────────────────────────────────────────────────
(async () => {
  try {
    const opts = parseArgs();
    await splitImage(opts);
  } catch (err) {
    console.error(`[✗] Error: ${err.message}`);
    process.exit(1);
  }
})();

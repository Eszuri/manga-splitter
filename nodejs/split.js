#!/usr/bin/env node
/**
 * manga-splitter.js — AUTO MODE v5
 *
 * Strategi baru: "Valley-aware cutting"
 *
 * 1. Hitung variance untuk setiap baris
 * 2. Panel boundary (variance sangat rendah) = titik potong TERBAIK
 * 3. "Valley" (local minimum variance) = titik potong BAGUS
 * 4. Saat forced cut di maxHeight:
 *    - Cari boundary/valley TERDEKAT ke maxHeight
 *    - Jika tidak ada, cari area dengan variance TERENDAH
 *    - Ini otomatis menghindari area kompleks (tempat text biasanya ada)
 *
 * Dependencies: npm install sharp
 */

const sharp = require("sharp");
const path = require("path");
const fs = require("fs");

// ─── CONFIG ────────────────────────────────────────────────────────
const DEFAULT_METHOD = "auto";
const DEFAULT_TOLERANCE = 15;
const DEFAULT_MIN_HEIGHT = 200;
const DEFAULT_MAX_HEIGHT = 2000;
const DEFAULT_FACTOR = 1.4;
const OUTPUT_FORMAT = "jpg";
const JPEG_QUALITY = 92;

// AUTO MODE
const SOLID_ROW_THRESHOLD = 200;    // variance < ini = panel boundary
const VALLEY_WINDOW = 50;           // Window untuk deteksi valley (px)
const VALLEY_RATIO = 0.5;           // Valley = variance < 50% dari surrounding
const MIN_VALLEY_DEPTH = 500;       // Minimal kedalaman valley (variance diff)
// ────────────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes("--help") || args.includes("-h")) { printHelp(); process.exit(0); }
  const opts = {
    input: null, output: null, method: DEFAULT_METHOD,
    tolerance: DEFAULT_TOLERANCE, minHeight: DEFAULT_MIN_HEIGHT,
    maxHeight: DEFAULT_MAX_HEIGHT, factor: DEFAULT_FACTOR,
    format: OUTPUT_FORMAT, quality: JPEG_QUALITY,
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
        default: console.error(`[!] Flag tidak dikenal: ${args[i]}`); process.exit(1);
      }
    } else { positional.push(args[i]); }
  }
  if (positional.length === 0) { console.error("[!] Input file wajib."); process.exit(1); }
  opts.input = positional[0];
  return opts;
}

function printHelp() {
  console.log(`
manga-splitter v5 — Valley-aware cutting

PENGGUNAAN:
  node split.js <input> [opsi]

METODE:
  -m auto        Deteksi panel boundaries + valleys (default)
  -m whitespace  Deteksi garis putih
  -m fixed       Potong dengan rasio tetap

OPSI:
  -o, --output       Folder output
  --min-height       Tinggi minimum px (default: 200)
  --max-height       Tinggi maksimum px (default: 2000)
  --factor           Faktor fixed ratio (default: 1.4)
  --format           Format: jpg | png (default: jpg)
  --quality          Kualitas 1-100 (default: 92)

CONTOH:
  node split.js manga.png
  node split.js manga.png --max-height 1500
  `);
}

async function loadImage(inputPath) {
  const img = sharp(inputPath);
  const meta = await img.metadata();
  const { data } = await img.raw().toBuffer({ resolveWithObject: true });
  return { data: Buffer.from(data), width: meta.width, height: meta.height, channels: meta.channels };
}

// ─── VARIANCE COMPUTATION ──────────────────────────────────────────

function computeAllVariances(data, width, height, channels) {
  const variances = new Float32Array(height);
  for (let y = 0; y < height; y++) {
    const off = y * width * channels;
    let sR = 0, sG = 0, sB = 0;
    for (let x = 0; x < width; x++) {
      const o = off + x * channels;
      sR += data[o]; sG += data[o + 1]; sB += data[o + 2];
    }
    const aR = sR / width, aG = sG / width, aB = sB / width;
    let vR = 0, vG = 0, vB = 0;
    for (let x = 0; x < width; x++) {
      const o = off + x * channels;
      vR += (data[o] - aR) ** 2; vG += (data[o + 1] - aG) ** 2; vB += (data[o + 2] - aB) ** 2;
    }
    variances[y] = (vR + vG + vB) / (width * 3);
  }
  return variances;
}

// ─── CUT POINT DETECTION ───────────────────────────────────────────

/**
 * Cari semua "cut point candidates" dalam rentang [fromY, toY]:
 *
 * Tier 1: Panel boundary (variance < SOLID_ROW_THRESHOLD) → score tinggi
 * Tier 2: Valley (local minimum dengan kedalaman signifikan) → score sedang
 * Tier 3: Lowest variance row → score rendah
 *
 * Return: { y, score, type }
 */
function findBestCutPoint(variances, fromY, toY, height) {
  const candidates = [];

  for (let y = fromY; y <= toY && y < height; y++) {
    const v = variances[y];

    // Tier 1: Panel boundary
    if (v < SOLID_ROW_THRESHOLD) {
      // Cari tengah region solid
      let segStart = y;
      while (segStart > fromY && variances[segStart - 1] < SOLID_ROW_THRESHOLD) segStart--;
      let segEnd = y;
      while (segEnd < toY && segEnd < height - 1 && variances[segEnd + 1] < SOLID_ROW_THRESHOLD) segEnd++;
      const mid = Math.floor((segStart + segEnd) / 2);
      candidates.push({ y: mid, score: 1000, type: "boundary", variance: v });
      y = segEnd; // Skip rest of boundary
      continue;
    }

    // Tier 2: Valley (local minimum)
    if (y > VALLEY_WINDOW && y < height - VALLEY_WINDOW) {
      // Cek apakah y adalah local minimum
      const leftAvg = avgRange(variances, y - VALLEY_WINDOW, y - 1);
      const rightAvg = avgRange(variances, y + 1, y + VALLEY_WINDOW);
      const surroundingAvg = (leftAvg + rightAvg) / 2;

      if (v < surroundingAvg * VALLEY_RATIO && (surroundingAvg - v) > MIN_VALLEY_DEPTH) {
        // Cari tengah valley
        let vStart = y;
        while (vStart > fromY && variances[vStart - 1] < surroundingAvg * VALLEY_RATIO) vStart--;
        let vEnd = y;
        while (vEnd < toY && vEnd < height - 1 && variances[vEnd + 1] < surroundingAvg * VALLEY_RATIO) vEnd++;
        const mid = Math.floor((vStart + vEnd) / 2);
        const depth = surroundingAvg - variances[mid];
        candidates.push({ y: mid, score: 500 + Math.min(depth / 10, 200), type: "valley", variance: v });
        y = vEnd;
        continue;
      }
    }
  }

  if (candidates.length === 0) {
    // Tier 3: Cari row dengan variance terendah
    let minV = Infinity, minY = toY;
    for (let y = fromY; y <= toY && y < height; y++) {
      if (variances[y] < minV) { minV = variances[y]; minY = y; }
    }
    candidates.push({ y: minY, score: 100, type: "lowest", variance: minV });
  }

  return candidates;
}

function avgRange(arr, start, end) {
  let sum = 0, count = 0;
  for (let i = Math.max(0, start); i <= end && i < arr.length; i++) {
    sum += arr[i]; count++;
  }
  return count > 0 ? sum / count : 0;
}

// ─── AUTO CUTTING v5 ───────────────────────────────────────────────

function findAutoCuts(variances, height, minHeight, maxHeight) {
  const cuts = [];
  let currentY = 0;
  let boundaryCount = 0, valleyCount = 0, lowestCount = 0;

  while (currentY < height) {
    const remaining = height - currentY;

    // Sisa ≤ minHeight → gabung ke potongan terakhir
    if (remaining <= minHeight) {
      if (cuts.length > 0) {
        const last = cuts[cuts.length - 1];
        cuts[cuts.length - 1] = [last[0], height];
      } else {
        cuts.push([currentY, height]);
      }
      break;
    }

    // Target cut: maxHeight dari currentY
    const target = Math.min(currentY + maxHeight, height);
    // Search range: minHeight sampai maxHeight dari currentY
    const searchFrom = currentY + minHeight;
    const searchTo = Math.min(target, height - 1);

    // Cari cut point candidates
    const candidates = findBestCutPoint(variances, searchFrom, searchTo, height);

    // Pilih candidate terbaik:
    // Prioritas: score tertinggi, lalu paling dekat ke target
    candidates.sort((a, b) => {
      // Group by tier (score range)
      const aTier = a.score >= 1000 ? 1 : a.score >= 500 ? 2 : 3;
      const bTier = b.score >= 1000 ? 1 : b.score >= 500 ? 2 : 3;
      if (aTier !== bTier) return aTier - bTier; // Lower tier number = better
      // Same tier → prefer closer to target
      return Math.abs(a.y - target) - Math.abs(b.y - target);
    });

    const best = candidates[0];

    if (best.type === "boundary") boundaryCount++;
    else if (best.type === "valley") valleyCount++;
    else lowestCount++;

    cuts.push([currentY, best.y]);
    currentY = best.y;
  }

  console.log(`    Cut points: ${boundaryCount} boundary, ${valleyCount} valley, ${lowestCount} lowest-variance`);
  return cuts;
}

// ─── OTHER METHODS ─────────────────────────────────────────────────

function findCutsWhitespace(data, width, height, channels, tolerance, minHeight) {
  const solidRows = [];
  for (let y = 0; y < height; y++) {
    const off = y * width * channels;
    const rR = data[off], rG = data[off + 1], rB = data[off + 2];
    let solid = true;
    for (let x = 1; x < width; x++) {
      const o = off + x * channels;
      if (Math.abs(data[o] - rR) > tolerance || Math.abs(data[o + 1] - rG) > tolerance || Math.abs(data[o + 2] - rB) > tolerance) {
        solid = false; break;
      }
    }
    if (solid) solidRows.push(y);
  }
  const cuts = [];
  let start = 0, i = 0;
  while (i < solidRows.length) {
    const s = solidRows[i]; let j = i;
    while (j + 1 < solidRows.length && solidRows[j + 1] === solidRows[j] + 1) j++;
    const e = solidRows[j], cutY = Math.floor((s + e) / 2);
    if (cutY - start >= minHeight) { cuts.push([start, cutY]); start = e + 1; }
    i = j + 1;
  }
  if (height - start >= minHeight) cuts.push([start, height]);
  return cuts;
}

function findCutsFixed(width, height, factor) {
  const sliceH = Math.max(1, Math.floor(width * factor));
  const cuts = []; let y = 0;
  while (y < height) { cuts.push([y, Math.min(y + sliceH, height)]); y += sliceH; }
  return cuts;
}

// ─── MAIN ──────────────────────────────────────────────────────────

async function splitImage(opts) {
  const inputPath = path.resolve(opts.input);
  if (!fs.existsSync(inputPath)) { console.error(`[!] File tidak ditemukan: ${inputPath}`); process.exit(1); }

  let outputDir = opts.output;
  if (!outputDir) outputDir = path.join(path.dirname(inputPath), path.basename(inputPath, path.extname(inputPath)) + "_split");
  outputDir = path.resolve(outputDir);
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  console.log(`[+] Membaca gambar: ${inputPath}`);
  const { data, width, height, channels } = await loadImage(inputPath);
  console.log(`    Ukuran: ${width}×${height} px`);

  let cuts = [];

  if (opts.method === "whitespace") {
    console.log(`[+] Metode: Whitespace Detection`);
    cuts = findCutsWhitespace(data, width, height, channels, opts.tolerance, opts.minHeight);
  } else if (opts.method === "fixed") {
    console.log(`[+] Metode: Fixed Ratio (faktor=${opts.factor})`);
    cuts = findCutsFixed(width, height, opts.factor);
  } else if (opts.method === "auto") {
    console.log(`[+] Metode: AUTO v5 (valley-aware cutting)`);
    console.log(`    Tinggi: min=${opts.minHeight}px, max=${opts.maxHeight}px`);
    console.log(`    Menghitung variance per baris...`);

    const variances = computeAllVariances(data, width, height, channels);

    // Statistik
    let solidCount = 0;
    for (let y = 0; y < height; y++) if (variances[y] < SOLID_ROW_THRESHOLD) solidCount++;
    console.log(`    Solid rows: ${solidCount}/${height} (${((solidCount / height) * 100).toFixed(1)}%)`);

    cuts = findAutoCuts(variances, height, opts.minHeight, opts.maxHeight);
  }

  if (cuts.length === 0) { console.log("[!] Tidak ditemukan titik potong."); return []; }

  console.log(`[+] Ditemukan ${cuts.length} potongan. Menyimpan ke: ${outputDir}`);

  const saved = [];
  const ext = opts.format.toLowerCase();

  for (let idx = 0; idx < cuts.length; idx++) {
    const [y0, y1] = cuts[idx];
    const safeY1 = Math.min(y1, height);
    if (safeY1 <= y0) continue;
    const fileName = `halaman_${String(idx + 1).padStart(3, "0")}.${ext}`;
    const filePath = path.join(outputDir, fileName);
    await sharp(inputPath)
      .extract({ left: 0, top: y0, width, height: safeY1 - y0 })
      .toFormat(ext === "jpg" ? "jpeg" : ext, { quality: opts.quality })
      .toFile(filePath);
    saved.push(filePath);
    console.log(`    [${String(idx + 1).padStart(3, "0")}] y=${y0}–${safeY1} (tinggi=${safeY1 - y0}px) → ${fileName}`);
  }

  console.log(`\n[✓] Selesai! ${saved.length} potongan tersimpan di: ${outputDir}`);
  return saved;
}

(async () => {
  try { await splitImage(parseArgs()); }
  catch (err) { console.error(`[✗] Error: ${err.message}`); process.exit(1); }
})();

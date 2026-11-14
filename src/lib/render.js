import { loadImg } from './image.js';
import { warp } from './cv.js';

export const DEFAULT_EDITS = { filter: 'auto', brightness: 0, contrast: 0 };

// Non-destructive: the source image is never modified, edits are applied to a fresh canvas each time.
export function applyAdjust(canvas, { filter, brightness, contrast }) {
  const W = canvas.width, H = canvas.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const img = ctx.getImageData(0, 0, W, H);
  const d = img.data, n = d.length;
  const luma = (i) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];

  if (filter === 'auto') {
    const hist = new Uint32Array(256);
    for (let i = 0; i < n; i += 4) hist[luma(i) | 0]++;
    const total = n / 4;
    let lo = 0, hi = 255, acc = 0;
    while (lo < 255 && (acc += hist[lo]) < total * 0.01) lo++;
    acc = 0;
    while (hi > 0 && (acc += hist[hi]) < total * 0.01) hi--;
    if (hi - lo < 20) { lo = 0; hi = 255; }
    const k = 255 / (hi - lo);
    for (let i = 0; i < n; i += 4) {
      d[i] = (d[i] - lo) * k; d[i + 1] = (d[i + 1] - lo) * k; d[i + 2] = (d[i + 2] - lo) * k;
    }
  } else if (filter === 'gray') {
    for (let i = 0; i < n; i += 4) d[i] = d[i + 1] = d[i + 2] = luma(i);
  } else if (filter === 'bw') {
    // Local (adaptive) threshold via an integral image so shadows do not turn into black blobs.
    const g = new Uint8Array(W * H);
    for (let p = 0, i = 0; p < g.length; p++, i += 4) g[p] = luma(i);
    const S = W + 1;
    const I = new Float64Array(S * (H + 1));
    for (let y = 0; y < H; y++) {
      let row = 0;
      for (let x = 0; x < W; x++) {
        row += g[y * W + x];
        I[(y + 1) * S + x + 1] = I[y * S + x + 1] + row;
      }
    }
    const r = Math.max(8, Math.round(Math.min(W, H) / 24));
    for (let y = 0; y < H; y++) {
      const y0 = Math.max(0, y - r), y1 = Math.min(H - 1, y + r);
      for (let x = 0; x < W; x++) {
        const x0 = Math.max(0, x - r), x1 = Math.min(W - 1, x + r);
        const sum = I[(y1 + 1) * S + x1 + 1] - I[y0 * S + x1 + 1] - I[(y1 + 1) * S + x0] + I[y0 * S + x0];
        const mean = sum / ((x1 - x0 + 1) * (y1 - y0 + 1));
        const v = g[y * W + x] > mean * 0.9 ? 255 : 0;
        const i = (y * W + x) * 4;
        d[i] = d[i + 1] = d[i + 2] = v;
      }
    }
  }

  if (brightness || contrast) {
    const c = 1 + contrast / 100, b = brightness * 1.28;
    const lut = new Uint8ClampedArray(256);
    for (let v = 0; v < 256; v++) lut[v] = (v - 128) * c + 128 + b;
    for (let i = 0; i < n; i += 4) { d[i] = lut[d[i]]; d[i + 1] = lut[d[i + 1]]; d[i + 2] = lut[d[i + 2]]; }
  }
  ctx.putImageData(img, 0, 0);
}

// mode 'original': untouched pixels. mode 'clean': crop + perspective + enhancement.
export async function renderPage(page, mode, maxDim) {
  const img = await loadImg(page.url);
  const iw = img.naturalWidth, ih = img.naturalHeight;
  let canvas;
  if (mode === 'clean' && page.corners && !page.skipCrop) {
    canvas = warp(img, page.corners, maxDim);
  } else {
    const s = Math.min(1, maxDim / Math.max(iw, ih));
    canvas = document.createElement('canvas');
    canvas.width = Math.round(iw * s);
    canvas.height = Math.round(ih * s);
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
  }
  if (mode === 'clean') applyAdjust(canvas, page);
  return canvas;
}

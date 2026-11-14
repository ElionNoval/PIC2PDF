export const MAX_PAGES = 10;
export const LIMIT_MSG = 'Only 10 pages are allowed per PDF.';
const WORK_MAX = 2400; // longest edge kept for each page, keeps memory use sane on phones

export const tick = () => new Promise((r) => setTimeout(r, 0));

export const isImageFile = (f) =>
  ['image/jpeg', 'image/png', 'image/webp'].includes(f.type) || /\.(jpe?g|png|webp)$/i.test(f.name || '');

export const canvasToBlob = (canvas, q = 0.92) =>
  new Promise((res, rej) =>
    canvas.toBlob((b) => (b ? res(b) : rej(new Error('Could not encode image'))), 'image/jpeg', q)
  );

export const loadImg = (url) =>
  new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error('Image failed to load'));
    img.src = url;
  });

// Decode a File/Blob, fix orientation (browser applies EXIF), downscale, flatten transparency.
export async function normalize(source) {
  const tmp = URL.createObjectURL(source);
  try {
    const img = await loadImg(tmp);
    const iw = img.naturalWidth, ih = img.naturalHeight;
    if (!iw || !ih) throw new Error('Empty image');
    const s = Math.min(1, WORK_MAX / Math.max(iw, ih));
    const w = Math.round(iw * s), h = Math.round(ih * s);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    const blob = await canvasToBlob(c, 0.92);
    c.width = c.height = 0;
    return { url: URL.createObjectURL(blob), w, h };
  } finally {
    URL.revokeObjectURL(tmp);
  }
}

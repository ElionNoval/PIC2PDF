// OpenCV.js ships with the app (public/opencv.js) so detection works offline and never depends on a CDN.
const SRC = `${import.meta.env.BASE_URL}opencv.js`;
let loading = null;

export const cvReady = () => !!(window.cv && window.cv.Mat && window.cv.getPerspectiveTransform);

export function loadOpenCV() {
  if (cvReady()) return Promise.resolve(true);
  if (loading) return loading;
  loading = new Promise((resolve) => {
    const t0 = Date.now();
    const poll = () => {
      if (cvReady()) resolve(true);
      else if (Date.now() - t0 > 60000) resolve(false);
      else setTimeout(poll, 150);
    };
    const s = document.createElement('script');
    s.async = true;
    s.src = SRC;
    s.onload = () => {
      // Some OpenCV.js builds expose `cv` as a promise-like object until the runtime is ready.
      const v = window.cv;
      if (v && typeof v.then === 'function' && !v.Mat) {
        v.then((m) => { try { delete m.then; } catch { /* ignore */ } window.cv = m; });
      }
      poll();
    };
    s.onerror = () => resolve(false);
    document.head.appendChild(s);
  }).then((ok) => {
    if (!ok) loading = null; // allow retry
    return ok;
  });
  return loading;
}

/* ---------- geometry helpers (pixel space) ---------- */
const polyArea = (q) => {
  let a = 0;
  for (let i = 0; i < q.length; i++) { const p = q[i], n = q[(i + 1) % q.length]; a += p.x * n.y - n.x * p.y; }
  return Math.abs(a) / 2;
};

// Order as top-left, top-right, bottom-right, bottom-left, whatever the rotation.
function orderCorners(pts) {
  const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
  const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  const sorted = [...pts].sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));
  let start = 0;
  sorted.forEach((p, i) => { if (p.x + p.y < sorted[start].x + sorted[start].y) start = i; });
  return [0, 1, 2, 3].map((i) => sorted[(start + i) % 4]);
}

// Every inner angle must be roughly square, which allows for camera perspective but rejects slivers.
function looksLikeSheet(q) {
  for (let i = 0; i < 4; i++) {
    const a = q[i], b = q[(i + 1) % 4], c = q[(i + 2) % 4];
    const v1 = { x: a.x - b.x, y: a.y - b.y }, v2 = { x: c.x - b.x, y: c.y - b.y };
    const l1 = Math.hypot(v1.x, v1.y), l2 = Math.hypot(v2.x, v2.y);
    if (l1 < 8 || l2 < 8) return false;
    const deg = (Math.acos(Math.max(-1, Math.min(1, (v1.x * v2.x + v1.y * v2.y) / (l1 * l2)))) * 180) / Math.PI;
    if (deg < 48 || deg > 132) return false;
  }
  return true;
}

// Share of a quad's outline that lies on a real edge in the image (ignores stretches along the frame border).
function edgeSupport(quad, support, w, h) {
  const data = support.data;
  let hit = 0, total = 0;
  for (let i = 0; i < 4; i++) {
    const a = quad[i], b = quad[(i + 1) % 4];
    const n = Math.max(2, Math.round(Math.hypot(b.x - a.x, b.y - a.y) / 3));
    for (let j = 0; j <= n; j++) {
      const x = Math.round(a.x + ((b.x - a.x) * j) / n), y = Math.round(a.y + ((b.y - a.y) * j) / n);
      if (x <= 2 || y <= 2 || x >= w - 3 || y >= h - 3) continue;
      total++;
      if (data[y * w + x]) hit++;
    }
  }
  return total < 20 ? 0.5 : hit / total;
}

// Turn the blobs/edges in a binary image into four-corner candidates.
function collect(cv, bin, w, h, retrieval, out, support) {
  const contours = new cv.MatVector();
  const hier = new cv.Mat();
  try {
    cv.findContours(bin, contours, hier, retrieval, cv.CHAIN_APPROX_SIMPLE);
    const frame = w * h;
    for (let i = 0; i < contours.size(); i++) {
      const cnt = contours.get(i);
      try {
        if (cv.contourArea(cnt) < frame * 0.1) continue;
        const hull = new cv.Mat();
        try {
          cv.convexHull(cnt, hull, false, true);
          const hullArea = cv.contourArea(hull);
          const peri = cv.arcLength(hull, true);
          let quad = null;
          for (const eps of [0.01, 0.02, 0.03, 0.045, 0.065, 0.09]) {
            const ap = new cv.Mat();
            cv.approxPolyDP(hull, ap, eps * peri, true);
            const rows = ap.rows;
            if (rows === 4) quad = [0, 1, 2, 3].map((j) => ({ x: ap.data32S[j * 2], y: ap.data32S[j * 2 + 1] }));
            ap.delete();
            if (quad || rows < 4) break;
          }
          if (!quad) { // rounded corners or a ragged edge: fall back to the tightest rotated rectangle
            const r = cv.minAreaRect(hull);
            if (hullArea / (r.size.width * r.size.height) > 0.82) quad = cv.RotatedRect.points(r).map((p) => ({ x: p.x, y: p.y }));
          }
          if (!quad) continue;
          quad = orderCorners(quad.map((p) => ({ x: Math.min(w, Math.max(0, p.x)), y: Math.min(h, Math.max(0, p.y)) })));
          const qa = polyArea(quad);
          const fill = hullArea / qa;
          if (qa > frame * 0.1 && qa < frame * 0.97 && fill > 0.8 && fill < 1.2 && looksLikeSheet(quad)) {
            const sup = edgeSupport(quad, support, w, h);
            if (sup >= 0.3) out.push({ quad, score: (qa / frame) * Math.min(fill, 1 / fill) * sup * sup });
          }
        } finally { hull.delete(); }
      } finally { cnt.delete(); }
    }
  } finally { contours.delete(); hier.delete(); }
}

// Finds the most document-like four-corner shape in an RGBA canvas. `thorough` adds extra strategies.
function findDocument(cv, canvas, thorough) {
  const w = canvas.width, h = canvas.height;
  const mats = [];
  const keep = (m) => (mats.push(m), m);
  const cands = [];
  try {
    const rgba = keep(cv.imread(canvas));
    const gray = keep(new cv.Mat());
    cv.cvtColor(rgba, gray, cv.COLOR_RGBA2GRAY);
    const blur = keep(new cv.Mat());
    cv.GaussianBlur(gray, blur, new cv.Size(5, 5), 0);
    const k5 = keep(cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(5, 5)));
    const k3 = keep(cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3)));

    const support = keep(new cv.Mat());
    cv.Canny(blur, support, 20, 60);
    cv.dilate(support, support, k5);

    // 1) Edges on brightness
    for (const [lo, hi] of thorough ? [[25, 80], [50, 140]] : [[40, 120]]) {
      const e = keep(new cv.Mat());
      cv.Canny(blur, e, lo, hi);
      cv.dilate(e, e, k3);
      collect(cv, e, w, h, cv.RETR_LIST, cands, support);
    }
    // 2) Bright (or dark) sheet against its surroundings
    const bin = keep(new cv.Mat());
    cv.threshold(blur, bin, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);
    cv.morphologyEx(bin, bin, cv.MORPH_CLOSE, k5);
    cv.morphologyEx(bin, bin, cv.MORPH_OPEN, k5);
    collect(cv, bin, w, h, cv.RETR_EXTERNAL, cands, support);
    if (thorough) {
      const inv = keep(new cv.Mat());
      cv.bitwise_not(bin, inv);
      collect(cv, inv, w, h, cv.RETR_EXTERNAL, cands, support);
      // 3) Edges per colour channel: catches paper that has the same brightness as the table but another hue
      const rgb = keep(new cv.Mat());
      cv.cvtColor(rgba, rgb, cv.COLOR_RGBA2RGB);
      const planes = keep(new cv.MatVector());
      cv.split(rgb, planes);
      const merged = keep(new cv.Mat());
      for (let i = 0; i < 3; i++) {
        const p = planes.get(i);
        const b = new cv.Mat(), e = new cv.Mat();
        cv.GaussianBlur(p, b, new cv.Size(5, 5), 0);
        cv.Canny(b, e, 30, 90);
        if (i === 0) e.copyTo(merged); else cv.bitwise_or(merged, e, merged);
        p.delete(); b.delete(); e.delete();
      }
      cv.dilate(merged, merged, k3);
      collect(cv, merged, w, h, cv.RETR_LIST, cands, support);
    }
  } finally {
    mats.forEach((m) => { try { m.delete(); } catch { /* already freed */ } });
  }
  if (!cands.length) return null;
  cands.sort((a, b) => b.score - a.score);
  return cands[0].quad.map((p) => ({ x: p.x / w, y: p.y / h }));
}

let scratch = null;
/**
 * Detect the document in an <img> or <video>. Returns four normalised corners (tl, tr, br, bl) or null.
 * { live: true } uses a smaller image and fewer strategies so it can run several times a second.
 */
export function detectCorners(source, { live = false } = {}) {
  if (!cvReady()) return null;
  const sw = source.videoWidth || source.naturalWidth || source.width;
  const sh = source.videoHeight || source.naturalHeight || source.height;
  if (!sw || !sh) return null;
  const side = live ? 360 : 640;
  const s = Math.min(1, side / Math.max(sw, sh));
  const w = Math.round(sw * s), h = Math.round(sh * s);
  const c = live ? (scratch ||= document.createElement('canvas')) : document.createElement('canvas');
  c.width = w; c.height = h;
  c.getContext('2d', { willReadFrequently: true }).drawImage(source, 0, 0, w, h);
  try {
    return findDocument(window.cv, c, !live);
  } catch (e) {
    console.warn('Detection failed', e);
    return null;
  } finally {
    if (!live) c.width = c.height = 0;
  }
}

/* ---------- perspective correction ---------- */
// Straighten the quadrilateral into a flat rectangle. Falls back to a plain bounding-box crop.
export function warp(img, corners, maxDim) {
  const iw = img.naturalWidth, ih = img.naturalHeight;
  const P = corners.map((p) => ({ x: p.x * iw, y: p.y * ih }));
  const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  let w = Math.max(d(P[0], P[1]), d(P[3], P[2]));
  let h = Math.max(d(P[0], P[3]), d(P[1], P[2]));
  const s = Math.min(1, maxDim / Math.max(w, h));
  w = Math.max(2, Math.round(w * s));
  h = Math.max(2, Math.round(h * s));
  const out = document.createElement('canvas');

  if (cvReady()) {
    const cv = window.cv;
    const mats = [];
    try {
      const src = cv.imread(img); mats.push(src);
      const a = cv.matFromArray(4, 1, cv.CV_32FC2, P.flatMap((p) => [p.x, p.y])); mats.push(a);
      const b = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, w, 0, w, h, 0, h]); mats.push(b);
      const M = cv.getPerspectiveTransform(a, b); mats.push(M);
      const dst = new cv.Mat(); mats.push(dst);
      cv.warpPerspective(src, dst, M, new cv.Size(w, h), cv.INTER_LINEAR, cv.BORDER_REPLICATE, new cv.Scalar());
      out.width = w; out.height = h;
      cv.imshow(out, dst);
      return out;
    } catch (e) {
      console.warn('Perspective warp failed, using plain crop', e);
    } finally {
      mats.forEach((m) => { try { m.delete(); } catch { /* already freed */ } });
    }
  }

  const xs = P.map((p) => p.x), ys = P.map((p) => p.y);
  const x0 = Math.max(0, Math.min(...xs)), y0 = Math.max(0, Math.min(...ys));
  const bw = Math.min(iw, Math.max(...xs)) - x0, bh = Math.min(ih, Math.max(...ys)) - y0;
  const k = Math.min(1, maxDim / Math.max(bw, bh));
  out.width = Math.max(2, Math.round(bw * k));
  out.height = Math.max(2, Math.round(bh * k));
  out.getContext('2d').drawImage(img, x0, y0, bw, bh, 0, 0, out.width, out.height);
  return out;
}

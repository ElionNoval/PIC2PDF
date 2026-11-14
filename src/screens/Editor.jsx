import { useEffect, useRef, useState } from 'react';
import { detectCorners } from '../lib/cv.js';
import { loadImg, tick } from '../lib/image.js';
import { renderPage, DEFAULT_EDITS } from '../lib/render.js';

const FILTERS = [['original', 'Original'], ['auto', 'Auto Enhance'], ['gray', 'Grayscale'], ['bw', 'Black & White']];
const DEFAULT_CORNERS = [{ x: 0.08, y: 0.08 }, { x: 0.92, y: 0.08 }, { x: 0.92, y: 0.92 }, { x: 0.08, y: 0.92 }];
const clamp = (v) => Math.min(1, Math.max(0, v));

export default function Editor({ page, index, total, mode, cv, onChange, onBack }) {
  const clean = mode === 'clean';
  const [tab, setTab] = useState('crop');
  const [preview, setPreview] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const wrap = useRef(null);
  const cropping = !!page.corners && !page.skipCrop;

  // Live preview of the result (crop + filter) on a small copy.
  useEffect(() => {
    if (!clean || tab !== 'enhance') return;
    let dead = false;
    setBusy(true);
    const t = setTimeout(async () => {
      try {
        const c = await renderPage(page, mode, 900);
        if (!dead) setPreview(c.toDataURL('image/jpeg', 0.8));
        c.width = c.height = 0;
      } catch { if (!dead) setMsg('The preview could not be created.'); }
      if (!dead) setBusy(false);
    }, 120);
    return () => { dead = true; clearTimeout(t); };
  }, [tab, clean, page.corners, page.skipCrop, page.filter, page.brightness, page.contrast]);

  const detect = async () => {
    if (cv !== 'ready') { setMsg('The detector is not available. Drag the corners by hand.'); if (!page.corners) onChange({ corners: DEFAULT_CORNERS, skipCrop: false }); return; }
    setBusy(true); setMsg(''); await tick();
    try {
      const c = detectCorners(await loadImg(page.url));
      if (c) { onChange({ corners: c, skipCrop: false, detected: true }); setMsg('Document found.'); }
      else setMsg('No document found. Drag the corners by hand or skip cropping.');
    } catch { setMsg('Detection failed. Drag the corners by hand.'); }
    setBusy(false);
  };
  const toggleCrop = () =>
    cropping ? onChange({ skipCrop: true }) : onChange({ skipCrop: false, corners: page.corners || DEFAULT_CORNERS });

  const drag = (i) => (e) => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); };
  const move = (i) => (e) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    const r = wrap.current.getBoundingClientRect();
    const pt = { x: clamp((e.clientX - r.left) / r.width), y: clamp((e.clientY - r.top) / r.height) };
    onChange({ corners: page.corners.map((p, j) => (j === i ? pt : p)) });
  };

  return (
    <div className="screen editor">
      <header className="bar">
        <button className="link" onClick={onBack}>Back</button>
        <h2>Page {index + 1} of {total}</h2>
        <span />
      </header>

      {!clean ? (
        <>
          <div className="stage"><img src={page.url} alt={`Page ${index + 1}`} /></div>
          <p className="note">Original photo mode exports this page as it is. Switch to Clean document to crop and enhance.</p>
        </>
      ) : (
        <>
          <div className="seg" role="tablist">
            <button className={tab === 'crop' ? 'on' : ''} onClick={() => setTab('crop')}>Crop</button>
            <button className={tab === 'enhance' ? 'on' : ''} onClick={() => setTab('enhance')}>Enhance</button>
          </div>

          {tab === 'crop' ? (
            <>
              <div className="stage">
                <div className="wrap" ref={wrap}>
                  <img src={page.url} alt={`Page ${index + 1}`} draggable="false" />
                  {cropping && (
                    <>
                      <svg viewBox="0 0 1 1" preserveAspectRatio="none" className="quad">
                        <polygon points={page.corners.map((p) => `${p.x},${p.y}`).join(' ')} />
                      </svg>
                      {page.corners.map((p, i) => (
                        <span
                          key={i} className="handle" style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
                          onPointerDown={drag(i)} onPointerMove={move(i)}
                        />
                      ))}
                    </>
                  )}
                </div>
              </div>
              <p className="note">{msg || (cropping ? 'Drag the corners to fit the document.' : 'The full original image will be used.')}</p>
              <div className="row">
                <button className="btn secondary" onClick={detect} disabled={busy}>Auto-detect</button>
                <button className="btn secondary" onClick={toggleCrop}>{cropping ? 'Skip cropping' : 'Set corners'}</button>
              </div>
            </>
          ) : (
            <>
              <div className="stage">{preview ? <img src={preview} alt="Preview" className={busy ? 'dim' : ''} /> : <p className="note">Preparing preview</p>}</div>
              {msg && <p className="note warn">{msg}</p>}
              <div className="chips">
                {FILTERS.map(([k, label]) => (
                  <button key={k} className={`chip-btn ${page.filter === k ? 'on' : ''}`} onClick={() => onChange({ filter: k })}>{label}</button>
                ))}
              </div>
              <label className="slider">Brightness
                <input type="range" min="-60" max="60" value={page.brightness} onChange={(e) => onChange({ brightness: +e.target.value })} />
              </label>
              <label className="slider">Contrast
                <input type="range" min="-50" max="100" value={page.contrast} onChange={(e) => onChange({ contrast: +e.target.value })} />
              </label>
              <button className="btn secondary" onClick={() => onChange(DEFAULT_EDITS)}>Reset</button>
            </>
          )}
        </>
      )}
    </div>
  );
}

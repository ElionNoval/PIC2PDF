import { useEffect, useState } from 'react';
import { MAX_PAGES } from '../lib/image.js';
import { renderPage } from '../lib/render.js';

// In Clean document mode the thumbnail shows the cropped, straightened result so detection is visible.
function Thumb({ page, mode }) {
  const [src, setSrc] = useState(page.url);
  useEffect(() => {
    if (mode !== 'clean') { setSrc(page.url); return; }
    let dead = false;
    const t = setTimeout(async () => {
      try {
        const c = await renderPage(page, 'clean', 320);
        if (!dead) setSrc(c.toDataURL('image/jpeg', 0.75));
        c.width = c.height = 0;
      } catch { if (!dead) setSrc(page.url); }
    }, 60);
    return () => { dead = true; clearTimeout(t); };
  }, [mode, page.url, page.corners, page.skipCrop, page.filter, page.brightness, page.contrast]);
  return <img src={src} alt="" />;
}

export default function Pages({ pages, mode, setMode, cv, onRetryCv, onMove, onRemove, onEdit, onScan, onUpload, onExport, onHome }) {
  const full = pages.length >= MAX_PAGES;
  const detecting = mode === 'clean' && cv === 'ready' && pages.some((p) => !p.detected);

  const status = (p) => {
    if (mode === 'original') return 'Original';
    if (!p.detected && cv === 'ready') return 'Detecting';
    if (!p.corners) return p.detected ? 'No document found' : 'Waiting for detector';
    return p.skipCrop ? 'Not cropped' : 'Cropped';
  };

  return (
    <div className="screen pages">
      <header className="bar">
        <button className="link" onClick={onHome}>Home</button>
        <h2>Your pages</h2>
        <span />
      </header>
      <p className="count">{pages.length} of {MAX_PAGES} pages selected.</p>

      <div className="seg" role="group" aria-label="Processing">
        <button className={mode === 'original' ? 'on' : ''} onClick={() => setMode('original')}>Original photo</button>
        <button className={mode === 'clean' ? 'on' : ''} onClick={() => setMode('clean')}>Clean document</button>
      </div>
      {mode === 'clean' && cv === 'loading' && <p className="note">Loading the document detector. Pages are cropped automatically as soon as it is ready.</p>}
      {mode === 'clean' && cv === 'failed' && (
        <p className="note warn">The detector could not load (check your connection). Set corners by hand on each page, or use Original photo. <button className="link" onClick={onRetryCv}>Try again</button></p>
      )}

      {pages.length === 0 ? (
        <p className="empty">No pages yet. Scan or upload to get started.</p>
      ) : (
        <ul className="list">
          {pages.map((p, i) => (
            <li className="card page" key={p.id}>
              <button className="thumb" onClick={() => onEdit(i)} aria-label={`Preview page ${i + 1}`}>
                <Thumb page={p} mode={mode} />
              </button>
              <div className="meta">
                <strong>Page {i + 1}</strong>
                <span className="chip">{status(p)}</span>
                <button className="link" onClick={() => onEdit(i)}>{mode === 'clean' ? 'Edit' : 'Preview'}</button>
              </div>
              <div className="acts">
                <button disabled={i === 0} onClick={() => onMove(i, -1)} aria-label="Move up">Up</button>
                <button disabled={i === pages.length - 1} onClick={() => onMove(i, 1)} aria-label="Move down">Down</button>
                <button className="del" onClick={() => onRemove(i)} aria-label={`Remove page ${i + 1}`}>Remove</button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="dock">
        {full ? <p className="note">Page limit reached. Remove a page to add another.</p> : (
          <div className="row">
            <button className="btn secondary" onClick={onScan}>Scan more</button>
            <button className="btn secondary" onClick={onUpload}>Upload more</button>
          </div>
        )}
        <button className="btn primary" disabled={!pages.length || detecting} onClick={onExport}>
          {detecting ? 'Detecting documents' : 'Create PDF'}
        </button>
      </div>
    </div>
  );
}

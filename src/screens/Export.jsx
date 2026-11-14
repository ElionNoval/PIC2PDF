import { useEffect, useRef, useState } from 'react';
import { buildPdf } from '../lib/pdf.js';

export default function Export({ pages, mode, onBack, onNew }) {
  const [name, setName] = useState('document');
  const [busy, setBusy] = useState(true);
  const [progress, setProgress] = useState(0);
  const [err, setErr] = useState('');
  const [res, setRes] = useState(null);
  const [msg, setMsg] = useState('');
  const urlRef = useRef(null);

  const run = async () => {
    setBusy(true); setErr(''); setProgress(0);
    try {
      const r = await buildPdf(pages, mode, setProgress);
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = URL.createObjectURL(r.blob);
      setRes({ ...r, url: urlRef.current });
    } catch (e) {
      console.error(e);
      setErr('The PDF could not be created. A very large image may have run out of memory. Try fewer pages or Original photo mode.');
    }
    setBusy(false);
  };
  useEffect(() => { run(); return () => urlRef.current && URL.revokeObjectURL(urlRef.current); }, []);

  const fileName = `${(name.trim() || 'document').replace(/[\\/:*?"<>|]+/g, '-').replace(/\.pdf$/i, '')}.pdf`;

  const download = () => {
    const a = document.createElement('a');
    a.href = res.url; a.download = fileName;
    document.body.appendChild(a); a.click(); a.remove();
  };
  const share = async () => {
    const file = new File([res.blob], fileName, { type: 'application/pdf' });
    if (!navigator.canShare?.({ files: [file] })) { setMsg('Sharing is not supported in this browser. Use Download instead.'); return; }
    try { await navigator.share({ files: [file], title: fileName }); setMsg(''); }
    catch (e) { if (e.name !== 'AbortError') setMsg('Sharing failed. Use Download instead.'); }
  };

  return (
    <div className="screen export">
      <header className="bar">
        <button className="link" onClick={onBack} disabled={busy}>Back</button>
        <h2>Your PDF</h2>
        <span />
      </header>

      {busy && (
        <div className="progress" role="status">
          <div className="bar-track"><div className="bar-fill" style={{ width: `${(progress / pages.length) * 100}%` }} /></div>
          <p>Creating page {Math.max(progress, 1)} of {pages.length}</p>
        </div>
      )}
      {err && (
        <div className="card err">
          <p>{err}</p>
          <div className="row"><button className="btn secondary" onClick={onBack}>Back to pages</button><button className="btn primary" onClick={run}>Try again</button></div>
        </div>
      )}

      {res && !busy && (
        <>
          <p className="count">{pages.length} page{pages.length > 1 ? 's' : ''}</p>
          <div className="previews">
            {res.thumbs.map((t, i) => (
              <figure key={i}><img src={t} alt={`Page ${i + 1}`} /><figcaption>{i + 1}</figcaption></figure>
            ))}
          </div>
          <a className="link" href={res.url} target="_blank" rel="noreferrer">Open full preview</a>
          <label className="field">File name
            <span className="input"><input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} /><em>.pdf</em></span>
          </label>
          {msg && <p className="note warn">{msg}</p>}
          <div className="dock">
            <div className="row">
              <button className="btn primary" onClick={download}>Download PDF</button>
              <button className="btn secondary" onClick={share}>Share PDF</button>
            </div>
            <button className="btn quiet" onClick={onNew}>Start a new document</button>
          </div>
        </>
      )}
    </div>
  );
}

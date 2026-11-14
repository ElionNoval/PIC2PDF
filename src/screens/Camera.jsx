import { useEffect, useRef, useState } from 'react';
import { MAX_PAGES } from '../lib/image.js';
import { cvReady, detectCorners } from '../lib/cv.js';

const avgDist = (a, b) => a.reduce((s, p, i) => s + Math.hypot(p.x - b[i].x, p.y - b[i].y), 0) / a.length;

export default function Camera({ count, mode, cv, onCapture, onDone }) {
  const root = useRef(null);
  const video = useRef(null);
  const stream = useRef(null);
  const svg = useRef(null);
  const shade = useRef(null);
  const edge = useRef(null);
  const live = useRef({ quad: null, miss: 0, stable: 0 });
  const [facing, setFacing] = useState('environment');
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState('');
  const [cams, setCams] = useState(0);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState(false);
  const [found, setFound] = useState(false);
  const wantLive = mode === 'clean';

  const stop = () => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  };

  useEffect(() => {
    let dead = false;
    setReady(false);
    setErr('');
    live.current = { quad: null, miss: 0, stable: 0 };
    if (!navigator.mediaDevices?.getUserMedia) {
      setErr('This browser cannot use the camera here. Camera access needs a secure (https) page. You can still use Upload Photos.');
      return;
    }
    (async () => {
      try {
        stop();
        const s = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
        if (dead) { s.getTracks().forEach((t) => t.stop()); return; }
        stream.current = s;
        video.current.srcObject = s;
        await video.current.play().catch(() => {});
        setReady(true);
        const devs = await navigator.mediaDevices.enumerateDevices();
        setCams(devs.filter((d) => d.kind === 'videoinput').length);
      } catch (e) {
        if (dead) return;
        if (e.name === 'NotAllowedError' || e.name === 'SecurityError')
          setErr('Camera permission was denied. Allow camera access in your browser settings, or use Upload Photos.');
        else if (e.name === 'NotFoundError' || e.name === 'OverconstrainedError')
          setErr('No camera was found on this device. Use Upload Photos instead.');
        else setErr('The camera could not be started. Close other apps using it and try again.');
      }
    })();
    return () => { dead = true; stop(); }; // always release the camera when leaving
  }, [facing]);

  // Live outline: look for the document ~8 times a second and draw it over the preview.
  useEffect(() => {
    if (!ready || !wantLive || cv !== 'ready') return;
    let stopped = false, timer, wasFound = false;
    const loop = () => {
      if (stopped) return;
      const v = video.current, box = root.current;
      if (v && box && v.videoWidth && cvReady() && !document.hidden) {
        let q = null;
        try { q = detectCorners(v, { live: true }); } catch { /* skip this frame */ }
        const L = live.current;
        if (q) {
          if (L.quad && avgDist(L.quad, q) < 0.07) {
            L.quad = L.quad.map((p, i) => ({ x: (p.x + q[i].x) / 2, y: (p.y + q[i].y) / 2 }));
            L.stable++;
          } else { L.quad = q; L.stable = 1; }
          L.miss = 0;
        } else if (++L.miss > 3) { L.quad = null; L.stable = 0; }

        // Map video coordinates to the screen (the preview is object-fit: cover).
        const W = box.clientWidth, H = box.clientHeight;
        const k = Math.max(W / v.videoWidth, H / v.videoHeight);
        const ox = (W - v.videoWidth * k) / 2, oy = (H - v.videoHeight * k) / 2;
        svg.current.setAttribute('viewBox', `0 0 ${W} ${H}`);
        if (L.quad) {
          const pts = L.quad.map((p) => `${(p.x * v.videoWidth * k + ox).toFixed(1)},${(p.y * v.videoHeight * k + oy).toFixed(1)}`);
          const poly = 'M' + pts.join('L') + 'Z';
          shade.current.setAttribute('d', `M0 0H${W}V${H}H0Z${poly}`);
          edge.current.setAttribute('d', poly);
        } else {
          shade.current.setAttribute('d', '');
          edge.current.setAttribute('d', '');
        }
        const nowFound = !!L.quad && L.stable >= 3;
        if (nowFound !== wasFound) { wasFound = nowFound; setFound(nowFound); }
      }
      timer = setTimeout(loop, 120);
    };
    loop();
    return () => { stopped = true; clearTimeout(timer); };
  }, [ready, wantLive, cv]);

  const full = count >= MAX_PAGES;
  const capture = async () => {
    const v = video.current;
    if (!ready || busy || full || !v.videoWidth) return;
    setBusy(true);
    setFlash(true);
    setTimeout(() => setFlash(false), 140);
    const L = live.current;
    const hint = wantLive && L.quad && L.stable >= 2 ? L.quad : null; // outline seen at the moment of capture
    try {
      const c = document.createElement('canvas');
      c.width = v.videoWidth; c.height = v.videoHeight;
      c.getContext('2d').drawImage(v, 0, 0);
      const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.92));
      c.width = c.height = 0;
      if (blob) await onCapture(blob, hint);
    } finally {
      setBusy(false);
    }
  };

  let hintText = '';
  if (wantLive) {
    if (cv === 'loading' || cv === 'idle') hintText = 'Loading the document detector';
    else if (cv === 'failed') hintText = 'Live detection is unavailable. Pages can still be cropped by hand.';
    else hintText = found ? 'Document found' : 'Point the camera at a document';
  }

  return (
    <div className="screen camera" ref={root}>
      {err ? (
        <div className="cam-error">
          <p>{err}</p>
          <button className="btn primary" onClick={onDone}>Back</button>
        </div>
      ) : (
        <>
          <video ref={video} playsInline muted autoPlay />
          <svg ref={svg} className="cam-overlay" preserveAspectRatio="none" aria-hidden="true">
            <path ref={shade} className="cam-shade" fillRule="evenodd" d="" />
            <path ref={edge} className={`cam-edge ${found ? 'found' : ''}`} d="" />
          </svg>
          {flash && <div className="flash" />}
          <div className="cam-top">
            <span className="pill">{count} of {MAX_PAGES} pages</span>
            {hintText && <span className={`pill ${found ? 'good' : ''}`}>{hintText}</span>}
            {full && <span className="pill warn">Page limit reached</span>}
          </div>
          <div className="cam-bar">
            <button className="cam-side" onClick={onDone}>{count ? 'Done' : 'Cancel'}</button>
            <button className="shutter" onClick={capture} disabled={!ready || busy || full} aria-label="Take photo" />
            {cams > 1 ? (
              <button className="cam-side" onClick={() => setFacing((f) => (f === 'environment' ? 'user' : 'environment'))}>
                Switch
              </button>
            ) : <span className="cam-side" />}
          </div>
        </>
      )}
    </div>
  );
}

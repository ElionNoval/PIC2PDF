import { useEffect, useRef, useState } from 'react';
import Home from './screens/Home.jsx';
import Camera from './screens/Camera.jsx';
import Pages from './screens/Pages.jsx';
import Editor from './screens/Editor.jsx';
import Export from './screens/Export.jsx';
import { MAX_PAGES, LIMIT_MSG, normalize, loadImg, isImageFile, tick } from './lib/image.js';
import { loadOpenCV, detectCorners } from './lib/cv.js';
import { DEFAULT_EDITS } from './lib/render.js';

let uid = 0;

export default function App() {
  const [screen, setScreen] = useState('home'); // home | camera | pages | edit | export
  const [pages, setPages] = useState([]);
  const [mode, setMode] = useState('clean'); // original | clean
  const [cv, setCv] = useState('idle'); // idle | loading | ready | failed
  const [editIndex, setEditIndex] = useState(0);
  const [toast, setToast] = useState('');
  const pagesRef = useRef([]);
  const pending = useRef(0);
  const fileInput = useRef(null);
  const timer = useRef(null);

  const update = (fn) => {
    const next = fn(pagesRef.current);
    pagesRef.current = next;
    setPages(next);
  };
  const notify = (msg) => {
    setToast(msg);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(''), 4500);
  };

  // Add images from any source. The 10 page limit covers camera + uploads together.
  const addImages = async (blobs) => {
    const room = MAX_PAGES - pagesRef.current.length - pending.current;
    if (room <= 0) { notify(LIMIT_MSG); return 0; }
    let list = blobs;
    if (blobs.length > room) {
      list = blobs.slice(0, room);
      notify(`${LIMIT_MSG} Added ${room}, skipped ${blobs.length - room}.`);
    }
    pending.current += list.length;
    const added = [];
    let bad = 0;
    for (const item of list) {
      try {
        const blob = item instanceof Blob ? item : item.blob;
        const n = await normalize(blob);
        added.push({ id: ++uid, ...n, hint: item.hint || null, corners: null, detected: false, skipCrop: false, ...DEFAULT_EDITS });
      } catch {
        bad++;
      }
    }
    pending.current -= list.length;
    if (bad) notify(`${bad} file${bad > 1 ? 's' : ''} could not be read as an image and ${bad > 1 ? 'were' : 'was'} skipped.`);
    update((p) => {
      const next = [...p, ...added].slice(0, MAX_PAGES);
      added.slice(next.length - p.length).forEach((a) => URL.revokeObjectURL(a.url));
      return next;
    });
    return added.length;
  };

  const onPick = async (e) => {
    const files = [...e.target.files];
    e.target.value = '';
    if (!files.length) return;
    const ok = files.filter(isImageFile);
    if (ok.length < files.length) notify('Only JPG, PNG and WebP images can be added.');
    if (ok.length) await addImages(ok);
    if (pagesRef.current.length) setScreen('pages');
  };
  const pick = () => {
    if (pagesRef.current.length >= MAX_PAGES) return notify(LIMIT_MSG);
    fileInput.current.click();
  };

  const patchPage = (id, patch) => update((l) => l.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  const removePage = (i) => {
    URL.revokeObjectURL(pagesRef.current[i].url);
    update((l) => l.filter((_, j) => j !== i));
  };
  const movePage = (i, dir) =>
    update((l) => {
      const j = i + dir;
      if (j < 0 || j >= l.length) return l;
      const c = [...l];
      [c[i], c[j]] = [c[j], c[i]];
      return c;
    });
  const newDocument = () => {
    pagesRef.current.forEach((p) => URL.revokeObjectURL(p.url));
    update(() => []);
    setMode('clean');
    setScreen('home');
  };

  // Load OpenCV as soon as Clean document mode is active so it is ready before the first scan.
  const startCv = () => {
    setCv('loading');
    loadOpenCV().then((ok) => setCv(ok ? 'ready' : 'failed'));
  };
  useEffect(() => {
    if (mode === 'clean' && cv === 'idle') startCv();
  }, [mode, cv]);

  // Auto-detect one page at a time so the interface never freezes.
  useEffect(() => {
    if (mode !== 'clean' || cv !== 'ready') return;
    const todo = pages.find((p) => !p.detected);
    if (!todo) return;
    let dead = false;
    (async () => {
      await tick();
      let corners = null;
      try { corners = detectCorners(await loadImg(todo.url)); } catch { /* page removed or unreadable */ }
      if (!corners && todo.hint) corners = todo.hint;
      if (!dead) patchPage(todo.id, { detected: true, corners });
    })();
    return () => { dead = true; };
  }, [pages, mode, cv]);

  const back = () => setScreen(pages.length ? 'pages' : 'home');

  return (
    <div className={`app ${screen}`}>
      {screen === 'home' && (
        <Home count={pages.length} onScan={() => setScreen('camera')} onUpload={pick} onReview={() => setScreen('pages')} />
      )}
      {screen === 'camera' && (
        <Camera count={pages.length} mode={mode} cv={cv} onCapture={(blob, hint) => addImages([{ blob, hint }])} onDone={back} />
      )}
      {screen === 'pages' && (
        <Pages
          pages={pages} mode={mode} setMode={setMode} cv={cv} onRetryCv={startCv}
          onMove={movePage} onRemove={removePage}
          onEdit={(i) => { setEditIndex(i); setScreen('edit'); }}
          onScan={() => setScreen('camera')} onUpload={pick}
          onExport={() => setScreen('export')} onHome={() => setScreen('home')}
        />
      )}
      {screen === 'edit' && pages[editIndex] && (
        <Editor
          key={pages[editIndex].id}
          page={pages[editIndex]} index={editIndex} total={pages.length} mode={mode} cv={cv}
          onChange={(patch) => patchPage(pages[editIndex].id, patch)}
          onBack={() => setScreen('pages')}
        />
      )}
      {screen === 'export' && (
        <Export pages={pages} mode={mode} onBack={() => setScreen('pages')} onNew={newDocument} />
      )}
      <input
        ref={fileInput} type="file" hidden multiple
        accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" onChange={onPick}
      />
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}

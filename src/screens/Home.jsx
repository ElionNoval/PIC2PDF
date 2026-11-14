export default function Home({ count, onScan, onUpload, onReview }) {
  return (
    <main className="screen home">
      <div className="mark" aria-hidden="true">
        <span className="sheet s1" /><span className="sheet s2" /><span className="sheet s3" />
      </div>
      <h1>P2PDF</h1>
      <p className="headline">Your documents, digitized.</p>
      <p className="sub">Turn your photos into clean PDFs in seconds.</p>
      <div className="stack">
        <button className="btn primary" onClick={onScan}>Scan Documents</button>
        <button className="btn secondary" onClick={onUpload}>Upload Photos</button>
        {count > 0 && (
          <button className="btn quiet" onClick={onReview}>Continue with {count} page{count > 1 ? 's' : ''}</button>
        )}
      </div>
      <p className="fine">Everything stays on your device. Nothing is uploaded.</p>
    </main>
  );
}

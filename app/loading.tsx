export default function Loading() {
  return (
    <main id="main-content" className="loading-page" aria-live="polite">
      <div>
        <span className="loading-mark" aria-hidden="true" />
        <strong>Resolving Nodezuno context</strong>
        <small>Identity · policy · route · evidence</small>
      </div>
    </main>
  );
}

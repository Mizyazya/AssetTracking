export default function Loading() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      <div className="skeleton-block" style={{ height: '1.75rem', width: '12rem' }} />
      <div className="stat-grid">
        <div className="skeleton-block" style={{ height: '4.5rem' }} />
        <div className="skeleton-block" style={{ height: '4.5rem' }} />
        <div className="skeleton-block" style={{ height: '4.5rem' }} />
      </div>
      <div className="skeleton-block" style={{ height: '2.5rem' }} />
      <div className="skeleton-block" style={{ height: '2.5rem' }} />
      <div className="skeleton-block" style={{ height: '2.5rem' }} />
      <div className="skeleton-block" style={{ height: '2.5rem' }} />
    </div>
  );
}

import Link from 'next/link';
import { requireUser } from '@/lib/session';
import { formatDateTime } from '@/lib/time';
import { getLocationBreakdown, getRecentActivity, getTaskStats, getTopHolders } from '@/lib/dashboard';

export const dynamic = 'force-dynamic';

const ACTION_LABEL: Record<string, string> = {
  'Видано': 'Видано',
  'Повернення': 'Повернено',
  'Повернено': 'Повернено',
};

export default async function DashboardPage() {
  await requireUser();

  const taskStats = getTaskStats();
  const topHolders = getTopHolders(5);
  const recentActivity = getRecentActivity(10);
  const { rows: locationRows, unassigned, max } = getLocationBreakdown();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Дашборд</h1>

      <div className="stat-grid">
        <Link href="/tasks" className="stat-card" style={{ textDecoration: 'none' }}>
          <span className="stat-card-value">{taskStats.activeCount}</span>
          <span className="stat-card-label">Активних задач →</span>
        </Link>
        <div
          className="stat-card"
          style={
            taskStats.overdueCount > 0
              ? { borderColor: 'color-mix(in oklch, var(--warning) 40%, transparent)' }
              : undefined
          }
        >
          <span className="stat-card-value" style={taskStats.overdueCount > 0 ? { color: 'var(--warning)' } : undefined}>
            {taskStats.overdueCount}
          </span>
          <span className="stat-card-label">
            Довше {taskStats.overdueDays} днів без закриття
          </span>
        </div>
      </div>

      <div className="page-layout" style={{ gridTemplateColumns: '1fr 1fr' }}>
        {/* Top holders */}
        <div className="card space-y-3">
          <h2 className="font-semibold">Найбільше майна тримають</h2>
          {topHolders.length === 0 ? (
            <p style={{ color: 'var(--fg-subtle)', fontSize: 'var(--fs-sm)' }}>Немає даних</p>
          ) : (
            <ul className="space-y-2">
              {topHolders.map(({ person, qty }) => (
                <li key={person.id} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Link href={`/people/${person.id}`} style={{ color: 'var(--primary)' }}>
                      {person.name}
                    </Link>
                    <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--fg-muted)' }}>{qty}</span>
                  </div>
                  <div
                    style={{
                      height: '0.375rem',
                      borderRadius: 'var(--radius-md)',
                      background: 'var(--bg-subtle)',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        height: '100%',
                        width: `${(qty / (topHolders[0]?.qty || 1)) * 100}%`,
                        background: 'var(--primary)',
                        borderRadius: 'var(--radius-md)',
                        transition: 'width var(--dur-slow) var(--ease-out)',
                      }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Location breakdown */}
        <div className="card space-y-3">
          <h2 className="font-semibold">Стан майна по локаціях</h2>
          <ul className="space-y-2">
            {locationRows.map(({ location, qty }) => (
              <li key={location.id} className="space-y-1">
                <div className="flex items-center justify-between">
                  <Link href={`/locations/${location.id}`} style={{ color: 'var(--primary)' }}>
                    {location.name}
                  </Link>
                  <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--fg-muted)' }}>{qty}</span>
                </div>
                <div
                  style={{
                    height: '0.375rem',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--bg-subtle)',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      height: '100%',
                      width: `${(qty / max) * 100}%`,
                      background: 'var(--primary)',
                      borderRadius: 'var(--radius-md)',
                      transition: 'width var(--dur-slow) var(--ease-out)',
                    }}
                  />
                </div>
              </li>
            ))}
            {unassigned > 0 && (
              <li className="space-y-1">
                <div className="flex items-center justify-between">
                  <span style={{ color: 'var(--fg-subtle)' }}>Без локації / на складі</span>
                  <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--fg-muted)' }}>{unassigned}</span>
                </div>
                <div
                  style={{
                    height: '0.375rem',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--bg-subtle)',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      height: '100%',
                      width: `${(unassigned / max) * 100}%`,
                      background: 'var(--fg-disabled)',
                      borderRadius: 'var(--radius-md)',
                    }}
                  />
                </div>
              </li>
            )}
          </ul>
        </div>
      </div>

      {/* Recent activity */}
      <div className="card space-y-3">
        <h2 className="font-semibold">Останні дії</h2>
        {recentActivity.length === 0 ? (
          <p style={{ color: 'var(--fg-subtle)', fontSize: 'var(--fs-sm)' }}>Поки що немає записів</p>
        ) : (
          <ul>
            {recentActivity.map(l => (
              <li
                key={l.id}
                className="flex flex-wrap items-center justify-between gap-2 py-2"
                style={{ borderBottom: '1px solid var(--border-muted)', fontSize: 'var(--fs-sm)' }}
              >
                <span>
                  <span className="badge info" style={{ marginRight: 'var(--space-2)' }}>
                    {ACTION_LABEL[l.action ?? ''] ?? l.action ?? '—'}
                  </span>
                  <Link href={`/assets/${l.assetId}`} style={{ color: 'var(--primary)' }}>
                    {l.assetName}
                  </Link>
                  {l.quantity != null && <span style={{ color: 'var(--fg-muted)' }}> ×{l.quantity}</span>}
                  {l.personName && <span style={{ color: 'var(--fg-muted)' }}> — {l.personName}</span>}
                </span>
                <span style={{ color: 'var(--fg-subtle)', fontSize: 'var(--fs-xs)' }}>
                  {formatDateTime(l.timestamp)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

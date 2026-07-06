import Link from 'next/link';
import { db } from '@/db';
import { user, userSession } from '@/db/schema';
import { eq, like, and } from 'drizzle-orm';
import { requireAdmin, sessionStatus } from '@/lib/session';
import { getFlash } from '@/lib/flash';
import { deleteUser } from '@/lib/user-actions';
import { AutoSubmitForm } from '@/components/AutoSubmitForm';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 15;

type SP = Promise<Record<string, string | string[] | undefined>>;
function str(v: string | string[] | undefined): string {
  return Array.isArray(v) ? (v[0] ?? '') : (v ?? '');
}

export default async function UsersPage({ searchParams }: { searchParams: SP }) {
  await requireAdmin();
  const sp = await searchParams;
  const flash = await getFlash();

  const page = Math.max(1, parseInt(str(sp.page)) || 1);
  const fName = str(sp.username);
  const fRole = str(sp.role);

  const conds = [];
  if (fName) conds.push(like(user.username, `%${fName}%`));
  if (fRole === 'admin' || fRole === 'user') conds.push(eq(user.role, fRole));

  const users = db
    .select()
    .from(user)
    .where(conds.length > 0 ? and(...conds) : undefined)
    .orderBy(user.username)
    .all();

  // `active` alone doesn't mean still-valid — see sessionStatus() in lib/session.ts —
  // so count in JS rather than a plain SQL `WHERE active`, or a timed-out session
  // nobody ever re-visited (and so never got lazily flipped) would still be counted.
  const activeRows = db
    .select({ userId: userSession.userId, lastSeenAt: userSession.lastSeenAt, loginTime: userSession.loginTime, active: userSession.active })
    .from(userSession)
    .where(eq(userSession.active, true))
    .all();
  const sessionCountMap = new Map<number, number>();
  for (const r of activeRows) {
    if (sessionStatus(r) !== 'active') continue;
    sessionCountMap.set(r.userId, (sessionCountMap.get(r.userId) ?? 0) + 1);
  }

  const total = users.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const curPage = Math.min(page, totalPages);
  const slice = users.slice((curPage - 1) * PAGE_SIZE, curPage * PAGE_SIZE);

  const hasFilters = fName || fRole;

  function buildUrl(overrides: Record<string, string | number | null | undefined>) {
    const base: Record<string, string> = {};
    if (fName) base.username = fName;
    if (fRole) base.role = fRole;
    base.page = String(curPage);
    const merged = { ...base, ...overrides };
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) {
      if (v != null && v !== '') p.set(k, String(v));
    }
    const qs = p.toString();
    return qs ? `/users?${qs}` : '/users';
  }

  return (
    <div className="space-y-4">
      {flash && (
        <div className={`alert ${flash.type === 'success' ? 'success' : 'danger'}`}>{flash.message}</div>
      )}

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Користувачі</h1>
        <Link href="/users/new" className="btn primary">
          Додати
        </Link>
      </div>

      <div className="page-layout">
        {/* Filter sidebar */}
        <aside className="filter-panel">
          <div className="filter-panel-title">Фільтри</div>
          <AutoSubmitForm method="get" action="/users">
            <div className="space-y-3">
              <div className="field">
                <label className="field-label">Логін</label>
                <input name="username" defaultValue={fName} placeholder="Пошук..." className="input" />
              </div>
              <div className="field">
                <label className="field-label">Роль</label>
                <select name="role" defaultValue={fRole} className="select">
                  <option value="">Усі</option>
                  <option value="admin">Адмін</option>
                  <option value="user">Користувач</option>
                </select>
              </div>
              {hasFilters && (
                // Hard navigation on purpose: clears uncontrolled input values a soft Link transition would leave stale.
                // eslint-disable-next-line @next/next/no-html-link-for-pages
                <a href="/users" className="btn secondary sm" style={{ display: 'block', textAlign: 'center' }}>
                  Скинути фільтри
                </a>
              )}
            </div>
          </AutoSubmitForm>
          <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--fg-subtle)' }}>Знайдено: {total}</p>
        </aside>

        {/* Table */}
        <div className="space-y-3">
          <div className="table-wrap overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Логін</th>
                  <th>Роль</th>
                  <th>Активних сесій</th>
                  <th>Дії</th>
                </tr>
              </thead>
              <tbody>
                {slice.length === 0 && (
                  <tr>
                    <td colSpan={4} className="text-center" style={{ color: 'var(--fg-subtle)', padding: 'var(--space-8)' }}>
                      Нікого не знайдено
                    </td>
                  </tr>
                )}
                {slice.map(u => (
                  <tr key={u.id}>
                    <td>
                      <Link href={`/users/${u.id}`} className="font-medium" style={{ color: 'var(--primary)' }}>
                        {u.username}
                      </Link>
                    </td>
                    <td>
                      <span className={`badge ${u.role === 'admin' ? 'warning' : 'info'}`}>
                        {u.role === 'admin' ? 'Адмін' : 'Користувач'}
                      </span>
                    </td>
                    <td>
                      <Link href={`/users/${u.id}/sessions`} style={{ color: 'var(--primary)' }}>
                        {sessionCountMap.get(u.id) ?? 0}
                      </Link>
                    </td>
                    <td>
                      <form action={deleteUser} className="inline">
                        <input type="hidden" name="user_id" value={u.id} />
                        <button type="submit" className="btn link danger sm">
                          Видалити
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="pagination">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(pg => (
                <a key={pg} href={buildUrl({ page: pg })} className={`page-btn${pg === curPage ? ' active' : ''}`}>
                  {pg}
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

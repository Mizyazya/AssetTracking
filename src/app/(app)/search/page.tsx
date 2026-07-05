import Link from 'next/link';
import { eq, like, or } from 'drizzle-orm';
import { db } from '@/db';
import { asset, location, person, task } from '@/db/schema';
import { requireUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

type SP = Promise<Record<string, string | string[] | undefined>>;

function str(v: string | string[] | undefined): string {
  return Array.isArray(v) ? (v[0] ?? '') : (v ?? '');
}

const RESULT_LIMIT = 25;

export default async function SearchPage({ searchParams }: { searchParams: SP }) {
  await requireUser();
  const sp = await searchParams;
  const q = str(sp.q).trim();

  let assets: Array<typeof asset.$inferSelect> = [];
  let people: Array<typeof person.$inferSelect> = [];
  let locations: Array<typeof location.$inferSelect> = [];
  let tasks: Array<typeof task.$inferSelect & { assetName: string }> = [];

  if (q) {
    const pattern = `%${q}%`;

    assets = db
      .select()
      .from(asset)
      .where(or(like(asset.name, pattern), like(asset.serial, pattern), like(asset.comments, pattern)))
      .limit(RESULT_LIMIT)
      .all();

    people = db.select().from(person).where(like(person.name, pattern)).limit(RESULT_LIMIT).all();

    locations = db.select().from(location).where(like(location.name, pattern)).limit(RESULT_LIMIT).all();

    const taskRows = db
      .select({
        id: task.id,
        assetId: task.assetId,
        text: task.text,
        status: task.status,
        createdAt: task.createdAt,
        closedAt: task.closedAt,
        closeComment: task.closeComment,
        assetName: asset.name,
      })
      .from(task)
      .innerJoin(asset, eq(task.assetId, asset.id))
      .where(like(task.text, pattern))
      .limit(RESULT_LIMIT)
      .all();
    tasks = taskRows;
  }

  const totalResults = assets.length + people.length + locations.length + tasks.length;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Пошук</h1>

      <form method="get" action="/search" className="flex gap-2" style={{ maxWidth: '28rem' }}>
        <input
          name="q"
          defaultValue={q}
          placeholder="Пошук по майну, людях, локаціях, задачах..."
          className="input"
          autoFocus
        />
        <button type="submit" className="btn primary">Знайти</button>
      </form>

      {!q && (
        <p style={{ color: 'var(--fg-subtle)' }}>Введіть пошуковий запит.</p>
      )}

      {q && totalResults === 0 && (
        <div className="card text-center" style={{ color: 'var(--fg-subtle)', padding: 'var(--space-6)' }}>
          Нічого не знайдено за запитом «{q}»
        </div>
      )}

      {q && assets.length > 0 && (
        <div className="card space-y-2">
          <h2 className="font-semibold">Майно ({assets.length})</h2>
          <ul className="space-y-1">
            {assets.map(a => (
              <li key={a.id}>
                <Link href={`/assets/${a.id}`} style={{ color: 'var(--primary)' }}>{a.name}</Link>
                {a.serial && <span style={{ color: 'var(--fg-subtle)', fontSize: 'var(--fs-xs)' }}> · {a.serial}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {q && people.length > 0 && (
        <div className="card space-y-2">
          <h2 className="font-semibold">Люди ({people.length})</h2>
          <ul className="space-y-1">
            {people.map(p => (
              <li key={p.id}>
                <Link href={`/people/${p.id}`} style={{ color: 'var(--primary)' }}>{p.name}</Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {q && locations.length > 0 && (
        <div className="card space-y-2">
          <h2 className="font-semibold">Локації ({locations.length})</h2>
          <ul className="space-y-1">
            {locations.map(l => (
              <li key={l.id}>
                <Link href={`/locations/${l.id}`} style={{ color: 'var(--primary)' }}>{l.name}</Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {q && tasks.length > 0 && (
        <div className="card space-y-2">
          <h2 className="font-semibold">Задачі ({tasks.length})</h2>
          <ul className="space-y-1">
            {tasks.map(t => (
              <li key={t.id}>
                <Link href={`/assets/${t.assetId}`} style={{ color: 'var(--primary)' }}>{t.assetName}</Link>
                <span style={{ color: 'var(--fg-muted)' }}> — {t.text}</span>
                {t.status === 'closed' && (
                  <span className="badge" style={{ marginLeft: 'var(--space-2)' }}>закрито</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

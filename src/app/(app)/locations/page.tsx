import Link from 'next/link';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { location, person } from '@/db/schema';
import { requireUser } from '@/lib/session';
import { getFlash } from '@/lib/flash';
import { addLocation, deleteLocation } from '@/lib/people-actions';

export const dynamic = 'force-dynamic';

export default async function LocationsPage() {
  await requireUser();
  const flash = await getFlash();

  const locations = db
    .select()
    .from(location)
    .orderBy(location.name)
    .all();

  // Person count per location
  const persons = db.select({ locationId: person.locationId }).from(person).all();
  const countMap = new Map<number, number>();
  for (const p of persons) {
    if (p.locationId) countMap.set(p.locationId, (countMap.get(p.locationId) ?? 0) + 1);
  }

  const inputCls = 'rounded border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900';

  return (
    <div className="space-y-4">
      {flash && (
        <div className={`rounded px-4 py-2 text-sm border ${flash.type === 'success' ? 'bg-green-50 text-green-800 border-green-200' : 'bg-red-50 text-red-800 border-red-200'}`}>
          {flash.message}
        </div>
      )}

      <h1 className="text-2xl font-semibold text-gray-900">Локації</h1>

      {/* Add form */}
      <form action={addLocation} className="flex gap-2">
        <input name="name" type="text" required placeholder="Назва нової локації" className={`${inputCls} w-64`} />
        <button type="submit" className="rounded bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700">
          Додати
        </button>
      </form>

      {/* List */}
      <div className="overflow-x-auto rounded border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr className="border-b border-gray-200 text-left text-gray-700">
              <th className="py-2 pr-4 font-medium">Назва</th>
              <th className="py-2 pr-4 font-medium">Людей</th>
              <th className="py-2 font-medium">Дії</th>
            </tr>
          </thead>
          <tbody>
            {locations.length === 0 && (
              <tr><td colSpan={3} className="py-8 text-center text-gray-500">Локацій немає</td></tr>
            )}
            {locations.map(l => (
              <tr key={l.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="py-2 pr-4">
                  <Link href={`/locations/${l.id}`} className="font-medium text-blue-600 hover:underline">
                    {l.name}
                  </Link>
                </td>
                <td className="py-2 pr-4 text-gray-600">{countMap.get(l.id) ?? 0}</td>
                <td className="py-2">
                  <form action={deleteLocation} className="inline">
                    <input type="hidden" name="location_id" value={l.id} />
                    <button type="submit" className="text-xs text-red-500 hover:text-red-700">
                      Видалити
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

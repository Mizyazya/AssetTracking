'use server';

import { redirect } from 'next/navigation';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { person, location, asset } from '@/db/schema';
import { requireUser } from '@/lib/session';
import { holderBalance, componentHolders } from '@/lib/ledger';
import { setFlash } from '@/lib/flash';

// ── People ─────────────────────────────────────────────────────────────────

export async function addPerson(formData: FormData) {
  await requireUser();
  const name = (formData.get('name') as string)?.trim();
  const locationId = formData.get('location_id') ? parseInt(formData.get('location_id') as string) : null;
  const phone = (formData.get('phone') as string)?.trim() || null;

  if (!name) {
    await setFlash("Ім'я не може бути порожнім", 'error');
    redirect('/people');
  }

  db.insert(person).values({ name, locationId, phone }).run();
  await setFlash('Людину додано');
  redirect('/people');
}

export async function editPerson(formData: FormData) {
  await requireUser();
  const personId = parseInt(formData.get('person_id') as string);
  const name = (formData.get('name') as string)?.trim();
  const locationId = formData.get('location_id') ? parseInt(formData.get('location_id') as string) : null;
  const phone = (formData.get('phone') as string)?.trim() || null;

  if (!name) {
    await setFlash("Ім'я не може бути порожнім", 'error');
    redirect(`/people/${personId}`);
  }

  db.update(person).set({ name, locationId, phone }).where(eq(person.id, personId)).run();
  await setFlash('Дані людини оновлено');
  redirect(`/people/${personId}`);
}

export async function deletePerson(formData: FormData) {
  await requireUser();
  const personId = parseInt(formData.get('person_id') as string);

  // Перевірка: активи на руках
  const hasActive = db
    .select({ id: asset.id })
    .from(asset)
    .where(eq(asset.currentHolderId, personId))
    .get();
  if (hasActive) {
    await setFlash('Не можна видалити людину, за якою закріплене майно', 'error');
    redirect('/people');
  }

  // Перевірка: компонентні баланси (відхилення від v1, PORTING.md §10)
  const components = db
    .select({ id: asset.id })
    .from(asset)
    .where(eq(asset.type, 'component'))
    .all();
  for (const c of components) {
    if (holderBalance(c.id, personId) > 0) {
      await setFlash('Не можна видалити людину, за якою закріплене майно', 'error');
      redirect('/people');
    }
  }

  db.delete(person).where(eq(person.id, personId)).run();
  await setFlash('Людину видалено');
  redirect('/people');
}

// ── Locations ──────────────────────────────────────────────────────────────

export async function addLocation(formData: FormData) {
  await requireUser();
  const name = (formData.get('name') as string)?.trim();

  if (!name) {
    await setFlash('Назва локації не може бути порожньою', 'error');
    redirect('/locations');
  }

  db.insert(location).values({ name }).run();
  await setFlash('Локацію додано');
  redirect('/locations');
}

export async function editLocation(formData: FormData) {
  await requireUser();
  const locationId = parseInt(formData.get('location_id') as string);
  const name = (formData.get('name') as string)?.trim();

  if (!name) {
    await setFlash('Назва локації не може бути порожньою', 'error');
    redirect(`/locations/${locationId}`);
  }

  db.update(location).set({ name }).where(eq(location.id, locationId)).run();
  await setFlash('Локацію оновлено');
  redirect(`/locations/${locationId}`);
}

export async function deleteLocation(formData: FormData) {
  await requireUser();
  const locationId = parseInt(formData.get('location_id') as string);

  // Відв'язати людей (не видаляти) — per PORTING.md §6
  db.update(person).set({ locationId: null }).where(eq(person.locationId, locationId)).run();
  db.delete(location).where(eq(location.id, locationId)).run();

  await setFlash('Локацію видалено');
  redirect('/locations');
}

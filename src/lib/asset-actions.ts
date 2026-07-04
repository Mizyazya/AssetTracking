'use server';

import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { asset, assetLog, task, person } from '@/db/schema';
import { requireUser } from '@/lib/session';
import { holderBalance } from '@/lib/ledger';
import { setFlash } from '@/lib/flash';

function now() {
  return new Date().toISOString();
}

function addLog(
  assetId: number,
  action: string,
  comment: string,
  opts?: { personId?: number | null; quantity?: number | null },
) {
  db.insert(assetLog)
    .values({
      assetId,
      action,
      timestamp: now(),
      comment,
      personId: opts?.personId ?? null,
      quantity: opts?.quantity ?? null,
    })
    .run();
}

function personName(id: number | null): string {
  if (!id) return '?';
  return db.select({ name: person.name }).from(person).where(eq(person.id, id)).get()?.name ?? '?';
}

// ── Add asset ──────────────────────────────────────────────────────────────

export async function addAsset(formData: FormData) {
  await requireUser();
  const name = (formData.get('name') as string)?.trim();
  const serial = (formData.get('serial') as string)?.trim() || null;
  const type = formData.get('type') as 'active' | 'component';
  const qty = Math.max(1, parseInt(formData.get('quantity') as string) || 1);
  const comments = (formData.get('comments') as string)?.trim() || null;

  if (!name) {
    await setFlash('Назва не може бути порожньою', 'error');
    redirect('/assets/new');
  }

  let finalSerial = serial;
  if (type === 'component' && !finalSerial) {
    finalSerial = `component-${Date.now()}`;
  }

  if (finalSerial) {
    const existing = db.select({ id: asset.id }).from(asset).where(eq(asset.serial, finalSerial)).get();
    if (existing) {
      await setFlash(
        type === 'active'
          ? 'Актив з таким серійним номером вже існує'
          : 'Компонент з таким серійним номером вже існує',
        'error',
      );
      redirect('/assets/new');
    }
  }

  const ts = now();
  const { lastInsertRowid } = db
    .insert(asset)
    .values({
      name,
      serial: finalSerial,
      quantity: type === 'component' ? qty : 1,
      type,
      status: 'На складі',
      comments,
      createdAt: ts,
    })
    .run();
  const createdId = Number(lastInsertRowid);

  addLog(createdId, 'Створено', `${type === 'active' ? 'Актив' : 'Компонент'} "${name}" додано`, {
    quantity: type === 'component' ? qty : 1,
  });

  await setFlash('Майно додано');
  redirect(`/assets/${createdId}`);
}

// ── Assign asset ───────────────────────────────────────────────────────────
// Handles: active assignment, component from stock, component person-to-person.

export async function assignAsset(formData: FormData) {
  await requireUser();
  const assetId = parseInt(formData.get('asset_id') as string);
  const personId = parseInt(formData.get('person_id') as string);
  const qty = Math.max(1, parseInt(formData.get('quantity') as string) || 1);
  const comment = (formData.get('comment') as string)?.trim() || null;
  const fromPersonIdRaw = formData.get('from_person_id') as string | null;
  const fromPersonId = fromPersonIdRaw ? parseInt(fromPersonIdRaw) : null;

  const a = db.select().from(asset).where(eq(asset.id, assetId)).get();
  if (!a) redirect('/');

  if (a.type === 'active') {
    const prevName = a.currentHolderId ? personName(a.currentHolderId) : null;
    const newName = personName(personId);
    const suffix = comment ? `. ${comment}` : '';

    if (prevName) {
      addLog(assetId, 'Передано', `Передано до ${newName}${suffix}`, { personId: a.currentHolderId });
      addLog(assetId, 'Отримано', `Отримано від ${prevName}${suffix}`, { personId });
    } else {
      addLog(assetId, 'Отримано', `Видано ${newName}${suffix}`, { personId });
    }
    db.update(asset).set({ currentHolderId: personId, status: 'У користуванні' }).where(eq(asset.id, assetId)).run();
  } else if (fromPersonId) {
    // component person-to-person
    const balance = holderBalance(assetId, fromPersonId);
    if (balance < qty) {
      await setFlash('Недостатньо компонентів у користувача для передачі', 'error');
      redirect(`/assets/${assetId}`);
    }
    const fromName = personName(fromPersonId);
    const toName = personName(personId);
    addLog(assetId, 'Повернення', `Передано від ${fromName} до ${toName}`, { personId: fromPersonId, quantity: qty });
    addLog(assetId, 'Видано', `Отримано від ${fromName}`, { personId, quantity: qty });
  } else {
    // component from stock
    if ((a.quantity ?? 0) < qty) {
      await setFlash('Недостатньо компонентів на складі', 'error');
      redirect(`/assets/${assetId}`);
    }
    const toName = personName(personId);
    const suffix = comment ? `. ${comment}` : '';
    db.update(asset).set({ quantity: (a.quantity ?? 0) - qty }).where(eq(asset.id, assetId)).run();
    addLog(assetId, 'Видано', `Видано ${toName}${suffix}`, { personId, quantity: qty });
  }

  await setFlash('Майно видано');
  redirect(`/assets/${assetId}`);
}

// ── Return asset ───────────────────────────────────────────────────────────

export async function returnAsset(formData: FormData) {
  await requireUser();
  const assetId = parseInt(formData.get('asset_id') as string);
  const fromPersonId = formData.get('person_id') ? parseInt(formData.get('person_id') as string) : null;
  const qty = Math.max(1, parseInt(formData.get('quantity') as string) || 1);

  const a = db.select().from(asset).where(eq(asset.id, assetId)).get();
  if (!a) redirect('/');

  if (a.type === 'active') {
    const holderName = a.currentHolderId ? personName(a.currentHolderId) : '?';
    addLog(assetId, 'Повернено', `Повернено від ${holderName} на склад`, { personId: a.currentHolderId });
    db.update(asset).set({ currentHolderId: null, status: 'На складі' }).where(eq(asset.id, assetId)).run();
  } else {
    if (!fromPersonId) redirect(`/assets/${assetId}`);
    const balance = holderBalance(assetId, fromPersonId);
    if (balance < qty) {
      await setFlash('Недостатньо компонентів у користувача для повернення', 'error');
      redirect(`/assets/${assetId}`);
    }
    const pName = personName(fromPersonId);
    db.update(asset).set({ quantity: (a.quantity ?? 0) + qty }).where(eq(asset.id, assetId)).run();
    addLog(assetId, 'Повернення', `Повернено ${qty} від ${pName}`, { personId: fromPersonId, quantity: qty });
  }

  await setFlash('Майно повернено');
  redirect(`/assets/${assetId}`);
}

// ── Add supply (component only) ────────────────────────────────────────────

export async function addSupply(formData: FormData) {
  await requireUser();
  const assetId = parseInt(formData.get('asset_id') as string);
  const qty = Math.max(1, parseInt(formData.get('quantity') as string) || 1);
  const comment = (formData.get('comment') as string)?.trim() || 'Поставка компоненту';

  const a = db.select().from(asset).where(eq(asset.id, assetId)).get();
  if (!a || a.type !== 'component') redirect(`/assets/${assetId}`);

  db.update(asset).set({ quantity: (a.quantity ?? 0) + qty }).where(eq(asset.id, assetId)).run();
  addLog(assetId, 'Поставка', comment, { quantity: qty });

  await setFlash('Поставку додано');
  redirect(`/assets/${assetId}`);
}

// ── Tasks ──────────────────────────────────────────────────────────────────

export async function addTask(formData: FormData) {
  await requireUser();
  const assetId = parseInt(formData.get('asset_id') as string);
  const text = (formData.get('text') as string)?.trim();

  if (!text) {
    await setFlash('Текст задачі не може бути порожнім', 'error');
    redirect(`/assets/${assetId}`);
  }

  db.insert(task).values({ assetId, text, status: 'active', createdAt: now() }).run();
  addLog(assetId, 'Задача', text);

  await setFlash('Задачу додано');
  redirect(`/assets/${assetId}`);
}

export async function closeTask(formData: FormData) {
  await requireUser();
  const taskId = parseInt(formData.get('task_id') as string);
  const assetId = parseInt(formData.get('asset_id') as string);
  const closeComment = (formData.get('close_comment') as string)?.trim() || null;

  const t = db.select().from(task).where(eq(task.id, taskId)).get();
  if (!t) redirect(`/assets/${assetId}`);

  if (t.status === 'closed') {
    await setFlash('Задача вже закрита.', 'error');
    redirect(`/assets/${assetId}`);
  }

  const ts = now();
  db.update(task).set({ status: 'closed', closedAt: ts, closeComment }).where(eq(task.id, taskId)).run();
  addLog(assetId, 'Задача закрита', `Закрито: ${t.text}${closeComment ? ` (${closeComment})` : ''}`);

  const returnTo = (formData.get('return_to') as string) || `/assets/${assetId}`;
  await setFlash('Задачу закрито.');
  redirect(returnTo);
}

// ── Edit asset ─────────────────────────────────────────────────────────────

export async function editAsset(formData: FormData) {
  await requireUser();
  const assetId = parseInt(formData.get('asset_id') as string);
  const name = (formData.get('name') as string)?.trim();
  const serial = (formData.get('serial') as string)?.trim() || null;
  const comments = (formData.get('comments') as string)?.trim() || null;

  if (!name) {
    await setFlash("Ім'я не може бути порожнім", 'error');
    redirect(`/assets/${assetId}`);
  }

  if (serial) {
    const existing = db.select({ id: asset.id }).from(asset).where(eq(asset.serial, serial)).get();
    if (existing && existing.id !== assetId) {
      await setFlash('Актив з таким серійним номером вже існує', 'error');
      redirect(`/assets/${assetId}`);
    }
  }

  db.update(asset).set({ name, serial, comments }).where(eq(asset.id, assetId)).run();
  await setFlash('Дані активу оновлено');
  redirect(`/assets/${assetId}`);
}

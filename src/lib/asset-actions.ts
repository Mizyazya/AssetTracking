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
    redirect('/');
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
      redirect('/');
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

function assignActiveAsset(assetId: number, personId: number, comment: string | null): boolean {
  const a = db.select().from(asset).where(eq(asset.id, assetId)).get();
  if (!a || a.type !== 'active') return false;

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
  return true;
}

export async function assignAsset(formData: FormData) {
  await requireUser();
  const assetId = parseInt(formData.get('asset_id') as string);
  const personId = parseInt(formData.get('person_id') as string);
  const qty = Math.max(1, parseInt(formData.get('quantity') as string) || 1);
  const comment = (formData.get('comment') as string)?.trim() || null;
  const fromPersonIdRaw = formData.get('from_person_id') as string | null;
  const fromPersonId = fromPersonIdRaw ? parseInt(fromPersonIdRaw) : null;
  const returnTo = (formData.get('return_to') as string) || `/assets/${assetId}`;

  const a = db.select().from(asset).where(eq(asset.id, assetId)).get();
  if (!a) redirect('/');

  if (a.type === 'active') {
    assignActiveAsset(assetId, personId, comment);
  } else if (fromPersonId) {
    // component person-to-person
    const balance = holderBalance(assetId, fromPersonId);
    if (balance < qty) {
      await setFlash('Недостатньо компонентів у користувача для передачі', 'error');
      redirect(returnTo);
    }
    const fromName = personName(fromPersonId);
    const toName = personName(personId);
    addLog(assetId, 'Повернення', `Передано від ${fromName} до ${toName}`, { personId: fromPersonId, quantity: qty });
    addLog(assetId, 'Видано', `Отримано від ${fromName}`, { personId, quantity: qty });
  } else {
    // component from stock
    if ((a.quantity ?? 0) < qty) {
      await setFlash('Недостатньо компонентів на складі', 'error');
      redirect(returnTo);
    }
    const toName = personName(personId);
    const suffix = comment ? `. ${comment}` : '';
    db.update(asset).set({ quantity: (a.quantity ?? 0) - qty }).where(eq(asset.id, assetId)).run();
    addLog(assetId, 'Видано', `Видано ${toName}${suffix}`, { personId, quantity: qty });
  }

  await setFlash('Майно видано');
  redirect(returnTo);
}

// ── Bulk transfer (active assets only — components need a quantity/source) ─

export async function bulkTransferAssets(formData: FormData) {
  await requireUser();
  const assetIds = formData
    .getAll('asset_ids')
    .map(v => parseInt(v as string))
    .filter(n => !Number.isNaN(n));
  const personId = parseInt(formData.get('person_id') as string);
  const comment = (formData.get('comment') as string)?.trim() || null;
  const returnTo = (formData.get('return_to') as string) || '/';

  if (assetIds.length === 0 || !personId) {
    await setFlash('Оберіть майно та отримувача', 'error');
    redirect(returnTo);
  }

  let count = 0;
  for (const assetId of assetIds) {
    if (assignActiveAsset(assetId, personId, comment)) count += 1;
  }

  await setFlash(count > 0 ? `Передано одиниць: ${count}` : 'Нічого не передано', count > 0 ? 'success' : 'error');
  redirect(returnTo);
}

// ── Return asset ───────────────────────────────────────────────────────────

export async function returnAsset(formData: FormData) {
  await requireUser();
  const assetId = parseInt(formData.get('asset_id') as string);
  const fromPersonId = formData.get('person_id') ? parseInt(formData.get('person_id') as string) : null;
  const qty = Math.max(1, parseInt(formData.get('quantity') as string) || 1);
  const returnTo = (formData.get('return_to') as string) || `/assets/${assetId}`;

  const a = db.select().from(asset).where(eq(asset.id, assetId)).get();
  if (!a) redirect('/');

  if (a.type === 'active') {
    const holderName = a.currentHolderId ? personName(a.currentHolderId) : '?';
    addLog(assetId, 'Повернено', `Повернено від ${holderName} на склад`, { personId: a.currentHolderId });
    db.update(asset).set({ currentHolderId: null, status: 'На складі' }).where(eq(asset.id, assetId)).run();
  } else {
    if (!fromPersonId) redirect(returnTo);
    const balance = holderBalance(assetId, fromPersonId);
    if (balance < qty) {
      await setFlash('Недостатньо компонентів у користувача для повернення', 'error');
      redirect(returnTo);
    }
    const pName = personName(fromPersonId);
    db.update(asset).set({ quantity: (a.quantity ?? 0) + qty }).where(eq(asset.id, assetId)).run();
    addLog(assetId, 'Повернення', `Повернено ${qty} від ${pName}`, { personId: fromPersonId, quantity: qty });
  }

  await setFlash('Майно повернено');
  redirect(returnTo);
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

function closeTaskCore(taskId: number, closeComment: string | null): boolean {
  const t = db.select().from(task).where(eq(task.id, taskId)).get();
  if (!t || t.status === 'closed') return false;

  const ts = now();
  db.update(task).set({ status: 'closed', closedAt: ts, closeComment }).where(eq(task.id, taskId)).run();
  addLog(t.assetId, 'Задача закрита', `Закрито: ${t.text}${closeComment ? ` (${closeComment})` : ''}`);
  return true;
}

export async function closeTask(formData: FormData) {
  await requireUser();
  const taskId = parseInt(formData.get('task_id') as string);
  const assetId = parseInt(formData.get('asset_id') as string);
  const closeComment = (formData.get('close_comment') as string)?.trim() || null;
  const returnTo = (formData.get('return_to') as string) || `/assets/${assetId}`;

  const ok = closeTaskCore(taskId, closeComment);
  if (!ok) {
    await setFlash('Задача вже закрита.', 'error');
    redirect(returnTo);
  }

  await setFlash('Задачу закрито.');
  redirect(returnTo);
}

export async function bulkCloseTasks(formData: FormData) {
  await requireUser();
  const taskIds = formData
    .getAll('task_ids')
    .map(v => parseInt(v as string))
    .filter(n => !Number.isNaN(n));
  const closeComment = (formData.get('close_comment') as string)?.trim() || null;
  const returnTo = (formData.get('return_to') as string) || '/tasks';

  if (taskIds.length === 0) {
    await setFlash('Оберіть задачі для закриття', 'error');
    redirect(returnTo);
  }

  let count = 0;
  for (const taskId of taskIds) {
    if (closeTaskCore(taskId, closeComment)) count += 1;
  }

  await setFlash(count > 0 ? `Закрито задач: ${count}` : 'Нічого не закрито', count > 0 ? 'success' : 'error');
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

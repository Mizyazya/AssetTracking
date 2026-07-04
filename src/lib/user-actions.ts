'use server';

import { redirect } from 'next/navigation';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { user, userSession } from '@/db/schema';
import { requireAdmin, requireUser, destroyCurrentSession } from '@/lib/session';
import { hashPassword, verifyPassword } from '@/lib/password';
import { setFlash } from '@/lib/flash';

// PORTING.md §4: 8–64 символи, велика + мала + цифра + не-алфанумерний
function validatePassword(p: string): boolean {
  return (
    p.length >= 8 &&
    p.length <= 64 &&
    /[A-Z]/.test(p) &&
    /[a-z]/.test(p) &&
    /\d/.test(p) &&
    /[^A-Za-z0-9]/.test(p)
  );
}

// ── User CRUD (admin only) ─────────────────────────────────────────────────

export async function addUser(formData: FormData) {
  await requireAdmin();
  const username = (formData.get('username') as string)?.trim();
  const password = (formData.get('password') as string) ?? '';
  const role = formData.get('role') === 'admin' ? 'admin' : 'user';

  if (!username) {
    await setFlash('Логін не може бути порожнім', 'error');
    redirect('/users/new');
  }
  if (!validatePassword(password)) {
    await setFlash('Пароль не відповідає вимогам безпеки.', 'error');
    redirect('/users/new');
  }

  const existing = db
    .select({ id: user.id })
    .from(user)
    .where(sql`lower(${user.username}) = lower(${username})`)
    .get();
  if (existing) {
    await setFlash('Користувач з таким логіном вже існує', 'error');
    redirect('/users/new');
  }

  db.insert(user).values({ username, passwordHash: hashPassword(password), role }).run();
  await setFlash('Користувача додано');
  redirect('/users');
}

export async function editUser(formData: FormData) {
  const { user: me } = await requireAdmin();
  const userId = parseInt(formData.get('user_id') as string);
  const username = (formData.get('username') as string)?.trim();
  const password = (formData.get('password') as string) ?? '';
  const roleRaw = formData.get('role') as string;

  if (!username) {
    await setFlash('Логін не може бути порожнім', 'error');
    redirect(`/users/${userId}`);
  }

  // Заборона змінювати власну роль
  const role = userId === me.id ? me.role! : (roleRaw === 'admin' ? 'admin' : 'user');

  if (password && !validatePassword(password)) {
    await setFlash('Пароль не відповідає вимогам безпеки.', 'error');
    redirect(`/users/${userId}`);
  }

  const existing = db
    .select({ id: user.id })
    .from(user)
    .where(sql`lower(${user.username}) = lower(${username})`)
    .get();
  if (existing && existing.id !== userId) {
    await setFlash('Користувач з таким логіном вже існує', 'error');
    redirect(`/users/${userId}`);
  }

  const updates: Partial<typeof user.$inferInsert> = { username, role };
  if (password) updates.passwordHash = hashPassword(password);
  db.update(user).set(updates).where(eq(user.id, userId)).run();

  await setFlash('Дані користувача оновлено');
  redirect(`/users/${userId}`);
}

export async function deleteUser(formData: FormData) {
  await requireAdmin();
  const userId = parseInt(formData.get('user_id') as string);

  // Захист останнього адміна
  const adminCount = db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.role, 'admin'))
    .all().length;
  const target = db.select().from(user).where(eq(user.id, userId)).get();
  if (target?.role === 'admin' && adminCount <= 1) {
    await setFlash('Неможливо видалити останнього адміністратора!', 'error');
    redirect('/users');
  }

  db.delete(user).where(eq(user.id, userId)).run();
  await setFlash('Користувача видалено');
  redirect('/users');
}

// ── Session management ─────────────────────────────────────────────────────

export async function closeSession(formData: FormData) {
  const { user: me } = await requireUser();
  const sessionId = parseInt(formData.get('session_id') as string);
  const returnTo = (formData.get('return_to') as string) || '/profile/sessions';

  const s = db.select().from(userSession).where(eq(userSession.id, sessionId)).get();
  if (!s) redirect(returnTo);

  // Адмін — будь-яку; звичайний — лише свою (PORTING.md §3)
  if (me.role !== 'admin' && s.userId !== me.id) redirect(returnTo);

  db
    .update(userSession)
    .set({ active: false, logoutTime: new Date().toISOString() })
    .where(eq(userSession.id, sessionId))
    .run();

  await setFlash('Сесію завершено');
  redirect(returnTo);
}

// ── Profile: change own password ───────────────────────────────────────────

export async function changePassword(formData: FormData) {
  const { user: me } = await requireUser();
  const currentPassword = (formData.get('current_password') as string) ?? '';
  const newPassword = (formData.get('new_password') as string) ?? '';

  if (!verifyPassword(currentPassword, me.passwordHash)) {
    await setFlash('Невірний поточний пароль', 'error');
    redirect('/profile');
  }
  if (!validatePassword(newPassword)) {
    await setFlash('Пароль не відповідає вимогам безпеки.', 'error');
    redirect('/profile');
  }

  db.update(user).set({ passwordHash: hashPassword(newPassword) }).where(eq(user.id, me.id)).run();
  await destroyCurrentSession();
  // After password change — log out, redirect to login
  redirect('/login');
}

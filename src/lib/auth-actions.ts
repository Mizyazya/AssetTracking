'use server';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { sql, eq } from 'drizzle-orm';
import { db } from '@/db';
import { user } from '@/db/schema';
import { verifyPassword, hashPassword, needsRehash } from './password';
import { createSession, destroyCurrentSession, SESSION_MAX_AGE } from './session';

export type LoginState = { error?: string };

export async function login(prevState: LoginState, formData: FormData): Promise<LoginState> {
  const username = ((formData.get('username') as string | null) ?? '').trim();
  const password = (formData.get('password') as string | null) ?? '';

  const users = await db
    .select()
    .from(user)
    .where(sql`lower(${user.username}) = lower(${username})`)
    .limit(1);
  const userRow = users[0];

  if (!userRow || !verifyPassword(password, userRow.passwordHash)) {
    return { error: 'Невірний логін або пароль' };
  }

  if (needsRehash(userRow.passwordHash)) {
    await db.update(user).set({ passwordHash: hashPassword(password) }).where(eq(user.id, userRow.id));
  }

  const hdrs = await headers();
  const ip = hdrs.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
  const userAgent = hdrs.get('user-agent') ?? null;

  const cookieValue = await createSession(userRow.id, ip, userAgent);
  const cookieStore = await cookies();
  cookieStore.set('session', cookieValue, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_MAX_AGE,
  });

  redirect('/');
}

export async function logout(): Promise<void> {
  await destroyCurrentSession();
  redirect('/login');
}

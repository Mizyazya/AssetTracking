'use server';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { sql, eq } from 'drizzle-orm';
import { db } from '@/db';
import { user, userSession } from '@/db/schema';
import { verifyPassword, hashPassword, needsRehash } from './password';
import {
  createSession,
  destroyCurrentSession,
  isSessionExpired,
  verifySignedCookie,
  SESSION_MAX_AGE,
} from './session';

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
  // Store the full X-Forwarded-For chain (not just the first hop) so the
  // sessions pages can show "client (via reverse-proxy)" instead of only
  // ever seeing the proxy's own address — see formatSessionIp().
  const ip = hdrs.get('x-forwarded-for') ?? hdrs.get('x-real-ip') ?? null;
  const userAgent = hdrs.get('user-agent') ?? null;

  // Submitting the login form again on a browser that already holds a
  // still-valid session cookie for this same account (e.g. "just making
  // sure I'm logged in") used to always insert a brand-new session row,
  // leaving the old one to sit there looking "active" forever. Reuse it
  // instead of piling up duplicates.
  const cookieStore = await cookies();
  const existingCookie = cookieStore.get('session')?.value;
  const existingPayload = existingCookie ? verifySignedCookie(existingCookie) : null;
  if (existingPayload && existingPayload.uid === userRow.id) {
    const existingSessions = await db
      .select()
      .from(userSession)
      .where(eq(userSession.sessionId, existingPayload.sid))
      .limit(1);
    const existing = existingSessions[0];
    if (existing && existing.active && !isSessionExpired(existing)) {
      await db
        .update(userSession)
        .set({ lastSeenAt: new Date().toISOString(), ip, userAgent })
        .where(eq(userSession.sessionId, existingPayload.sid));
      cookieStore.set('session', existingCookie!, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: SESSION_MAX_AGE,
      });
      redirect('/');
    }
  }

  const cookieValue = await createSession(userRow.id, ip, userAgent);
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

import crypto from 'node:crypto';
import { cookies } from 'next/headers';
import { redirect, forbidden } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { user, userSession } from '@/db/schema';
import { hashPassword } from './password';

const DEV_FALLBACK_KEY = 'dev-fallback-secret-key-CHANGE-IN-PRODUCTION-!!!!!';
let secretKeyWarned = false;

export function getSecretKey(): string {
  const key = process.env.SECRET_KEY;
  if (!key) {
    if (!secretKeyWarned) {
      console.warn(
        '[Assets 2.0] УВАГА: SECRET_KEY не задано в .env! ' +
          'Використовується небезпечний dev-fallback. ' +
          "Обов'язково задайте SECRET_KEY у продакшні.",
      );
      secretKeyWarned = true;
    }
    return DEV_FALLBACK_KEY;
  }
  return key;
}

export const SESSION_MAX_AGE = 1800;

export function signSession(payload: { uid: number; sid: string }): string {
  const payloadStr = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto
    .createHmac('sha256', getSecretKey())
    .update(payloadStr)
    .digest('base64url');
  return `${payloadStr}.${sig}`;
}

export function verifySignedCookie(value: string): { uid: number; sid: string } | null {
  try {
    const dotIndex = value.lastIndexOf('.');
    if (dotIndex === -1) return null;
    const payloadStr = value.slice(0, dotIndex);
    const sigStr = value.slice(dotIndex + 1);
    const expectedDigest = crypto
      .createHmac('sha256', getSecretKey())
      .update(payloadStr)
      .digest();
    const sigBytes = Buffer.from(sigStr, 'base64url');
    if (expectedDigest.length !== sigBytes.length) return null;
    if (!crypto.timingSafeEqual(expectedDigest, sigBytes)) return null;
    const data = JSON.parse(Buffer.from(payloadStr, 'base64url').toString('utf8')) as unknown;
    if (
      typeof data !== 'object' ||
      data === null ||
      typeof (data as Record<string, unknown>).uid !== 'number' ||
      typeof (data as Record<string, unknown>).sid !== 'string'
    )
      return null;
    return data as { uid: number; sid: string };
  } catch {
    return null;
  }
}

type UserRow = typeof user.$inferSelect;
type SessionRow = typeof userSession.$inferSelect;

export async function createSession(
  userId: number,
  ip: string | null,
  userAgent: string | null,
): Promise<string> {
  const sid = crypto.randomUUID();
  const now = new Date().toISOString();
  await db
    .insert(userSession)
    .values({ userId, sessionId: sid, loginTime: now, ip, userAgent, active: true });
  return signSession({ uid: userId, sid });
}

export async function getCurrentUser(): Promise<{ user: UserRow; session: SessionRow } | null> {
  try {
    const cookieStore = await cookies();
    const cookieValue = cookieStore.get('session')?.value;
    if (!cookieValue) return null;
    const payload = verifySignedCookie(cookieValue);
    if (!payload) return null;
    const { uid, sid } = payload;
    const sessions = await db
      .select()
      .from(userSession)
      .where(eq(userSession.sessionId, sid))
      .limit(1);
    const session = sessions[0];
    if (!session || !session.active) return null;
    if (session.userId !== uid) return null;
    const users = await db.select().from(user).where(eq(user.id, uid)).limit(1);
    const userRow = users[0];
    if (!userRow) return null;
    return { user: userRow, session };
  } catch {
    return null;
  }
}

export async function requireUser(): Promise<{ user: UserRow; session: SessionRow }> {
  const result = await getCurrentUser();
  if (!result) redirect('/login?reason=terminated');
  return result;
}

export async function requireAdmin(): Promise<{ user: UserRow; session: SessionRow }> {
  const result = await requireUser();
  if (result.user.role !== 'admin') forbidden();
  return result;
}

export async function destroyCurrentSession(): Promise<void> {
  const cookieStore = await cookies();
  const cookieValue = cookieStore.get('session')?.value;
  if (cookieValue) {
    const payload = verifySignedCookie(cookieValue);
    if (payload) {
      await db
        .update(userSession)
        .set({ active: false, logoutTime: new Date().toISOString() })
        .where(eq(userSession.sessionId, payload.sid));
    }
  }
  cookieStore.delete('session');
}

export async function ensureBootstrapUser(): Promise<void> {
  const existing = await db.select({ id: user.id }).from(user).limit(1);
  if (existing.length === 0) {
    await db
      .insert(user)
      .values({ username: 'admin', passwordHash: hashPassword('admin'), role: 'admin' });
    console.warn(
      '[Assets 2.0] Bootstrap: створено обліковий запис admin/admin. Негайно змініть пароль!',
    );
  }
}

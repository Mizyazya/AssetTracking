import crypto from 'node:crypto';

// Перевірка werkzeug-хешів зі старої БД + власний формат v2 (PORTING.md §5).
//
// werkzeug: "pbkdf2:sha256:<iter>$<salt>$<hex>" або "scrypt:<N>:<r>:<p>$<salt>$<hex>"
//   (salt — ASCII-рядок, ключ: pbkdf2 → розмір дайджесту, scrypt → 64 байти)
// v2:       "scrypt$<N>$<r>$<p>$<saltB64>$<hashB64>"

const V2_N = 16384;
const V2_R = 8;
const V2_P = 1;
const V2_KEYLEN = 64;

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, V2_KEYLEN, {
    N: V2_N,
    r: V2_R,
    p: V2_P,
  });
  return [
    'scrypt',
    V2_N,
    V2_R,
    V2_P,
    salt.toString('base64'),
    hash.toString('base64'),
  ].join('$');
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    if (stored.startsWith('scrypt$')) return verifyV2(password, stored);
    if (stored.startsWith('pbkdf2:') || stored.startsWith('scrypt:'))
      return verifyWerkzeug(password, stored);
    return false;
  } catch {
    return false;
  }
}

/** Хеш у старому werkzeug-форматі — після успішного входу пере-хешувати через hashPassword(). */
export function needsRehash(stored: string): boolean {
  return !stored.startsWith('scrypt$');
}

function verifyV2(password: string, stored: string): boolean {
  const [, n, r, p, saltB64, hashB64] = stored.split('$');
  const salt = Buffer.from(saltB64, 'base64');
  const expected = Buffer.from(hashB64, 'base64');
  const actual = crypto.scryptSync(password, salt, expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: 256 * Number(n) * Number(r),
  });
  return timingSafeEqual(actual, expected);
}

function verifyWerkzeug(password: string, stored: string): boolean {
  const [method, salt, hexHash] = stored.split('$');
  if (!method || !salt || !hexHash) return false;
  const expected = Buffer.from(hexHash, 'hex');
  const [algo, ...args] = method.split(':');

  let actual: Buffer;
  if (algo === 'pbkdf2') {
    // werkzeug: pbkdf2:sha256[:iterations], ключ = розмір дайджесту
    const digest = args[0] ?? 'sha256';
    const iterations = Number(args[1] ?? 600000);
    actual = crypto.pbkdf2Sync(password, salt, iterations, expected.length, digest);
  } else if (algo === 'scrypt') {
    const [n, r, p] = args.map(Number);
    actual = crypto.scryptSync(password, salt, expected.length, {
      N: n,
      r,
      p,
      maxmem: 256 * n * r, // hashlib дозволяє 128*N*r; беремо запас понад дефолтні 32 МіБ
    });
  } else {
    return false;
  }
  return timingSafeEqual(actual, expected);
}

function timingSafeEqual(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

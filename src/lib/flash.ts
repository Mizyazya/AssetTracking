import { cookies } from 'next/headers';

type Flash = { message: string; type: 'success' | 'error' };

export async function setFlash(message: string, type: Flash['type'] = 'success') {
  const c = await cookies();
  c.set('_flash', JSON.stringify({ message, type }), {
    maxAge: 15,
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
  });
}

export async function getFlash(): Promise<Flash | null> {
  const c = await cookies();
  const val = c.get('_flash')?.value;
  if (!val) return null;
  try {
    return JSON.parse(val) as Flash;
  } catch {
    return null;
  }
}

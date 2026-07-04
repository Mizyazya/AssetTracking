import { NextRequest, NextResponse } from 'next/server';

const SESSION_MAX_AGE = 1800;

// Next 16 перейменував конвенцію middleware → proxy. Edge-safe: без БД і node:crypto.
// Авторитетна перевірка сесії (підпис + active у БД) — на сервері в requireUser().
export function proxy(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;
  const sessionCookie = request.cookies.get('session');

  // Немає cookie і це не /login → на сторінку входу.
  if (!sessionCookie && pathname !== '/login') {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // Ковзний строк: подовжуємо cookie на 30 хв на кожному запиті з сесією.
  const response = NextResponse.next();
  if (sessionCookie) {
    response.cookies.set('session', sessionCookie.value, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: SESSION_MAX_AGE,
    });
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)'],
};

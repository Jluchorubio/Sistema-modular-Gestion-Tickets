import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PROTECTED = [
  '/dashboard',
  '/users',
  '/modules',
  '/profile',
  '/roles',
  '/trash',
  '/requests',
  '/calendar',
  '/my-tickets',
  '/tickets',
  '/inventory',
  '/reports',
];

export function middleware(request: NextRequest) {
  const { pathname }   = request.nextUrl;
  const hasSession     = request.cookies.has('has_session');
  const needsProfile   = request.cookies.get('needs_profile')?.value === '1';
  const isProtected    = PROTECTED.some((p) => pathname.startsWith(p));

  // 1. No session → login
  if (isProtected && !hasSession) {
    const url = new URL('/login', request.url);
    if (pathname !== '/') url.searchParams.set('from', pathname);
    return NextResponse.redirect(url);
  }

  // 2. Has session but profile incomplete → complete-profile (for all protected routes)
  if (isProtected && hasSession && needsProfile) {
    return NextResponse.redirect(new URL('/complete-profile', request.url));
  }

  // 3. Authenticated: redirect away from login
  if (pathname === '/login' && hasSession) {
    return NextResponse.redirect(
      new URL(needsProfile ? '/complete-profile' : '/dashboard', request.url),
    );
  }

  // 4. Authenticated + profile done: block re-entry to complete-profile
  if (pathname === '/complete-profile' && hasSession && !needsProfile) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  // 5. /setup requires session
  if (pathname === '/setup' && !hasSession) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon\\.ico|.*\\..*).*)'],
};

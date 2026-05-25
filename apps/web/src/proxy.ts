import { clerkMiddleware } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

export default clerkMiddleware(async (auth, req) => {
  const { userId } = await auth();
  
  // Always allow landing page
  if (req.nextUrl.pathname === '/') {
    return NextResponse.next();
  }

  // Always allow parks index and detail pages (public browsing)
  if (req.nextUrl.pathname === '/parks' || req.nextUrl.pathname.startsWith('/parks/')) {
    return NextResponse.next();
  }
  
  // Always allow API routes (they handle their own auth)
  if (req.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.next();
  }
  
  // Always allow sso-callback for OAuth to complete
  if (req.nextUrl.pathname === '/sso-callback') {
    return NextResponse.next();
  }

  // Allow onboarding — new SSO users may not have a session yet (missing_requirements)
  if (req.nextUrl.pathname.startsWith('/onboarding')) {
    return NextResponse.next();
  }
  
  // For ALL other routes (including /map), require auth
  if (!userId) {
    const url = req.nextUrl.clone();
    url.pathname = '/';
    return NextResponse.redirect(url);
  }
  
  // User is authenticated, allow access
  return NextResponse.next();
});

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
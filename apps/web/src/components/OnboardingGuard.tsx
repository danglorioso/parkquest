"use client";

import { useUser } from "@clerk/nextjs";
import { useRouter, usePathname } from "next/navigation";
import { useEffect } from "react";

const EXEMPT_PATHS = ['/onboarding', '/sign-in', '/sign-up', '/sso-callback', '/'];

export default function OnboardingGuard() {
  const { user, isLoaded, isSignedIn } = useUser();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    if (EXEMPT_PATHS.some(p => pathname === p || pathname.startsWith(p + '/'))) return;
    if (!user?.username) {
      router.replace('/onboarding/username');
    }
  }, [isLoaded, isSignedIn, user, pathname, router]);

  return null;
}

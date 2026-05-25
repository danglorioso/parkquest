"use client";

import { useEffect } from "react";
import { useUser, useSignUp } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { AuthHeroLayout } from "@/components/AuthHeroLayout";

export default function OnboardingUsernamePage() {
  const { user, isLoaded: userLoaded } = useUser();
  const { signUp, isLoaded: signUpLoaded } = useSignUp();
  const router = useRouter();

  const isLoaded = userLoaded && signUpLoaded;
  const isMissingRequirements = signUp?.status === "missing_requirements";

  useEffect(() => {
    if (!isLoaded) return;
    // Already authenticated and has username — send to map
    if (user?.username) { router.replace("/map"); return; }
    // No auth state at all and no ongoing sign-up — send home
    if (!user && !isMissingRequirements) { router.replace("/"); }
  }, [isLoaded, user, isMissingRequirements, router]);

  if (!isLoaded) return null;
  if (!user && !isMissingRequirements) return null;
  if (user?.username) return null;

  return <AuthHeroLayout forcedMode="username" />;
}

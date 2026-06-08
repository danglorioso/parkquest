"use client";

import { useEffect } from "react";
import { useClerk } from "@clerk/nextjs";
import { useRouter } from "next/navigation";

export default function SSOCallback() {
  const { handleRedirectCallback } = useClerk();
  const router = useRouter();

  useEffect(() => {
    const storedRedirect = sessionStorage.getItem("pq_auth_redirect") ?? "";
    sessionStorage.removeItem("pq_auth_redirect");
    const signInDest = storedRedirect.startsWith("/") && !storedRedirect.startsWith("//")
      ? storedRedirect
      : "/dashboard";

    handleRedirectCallback({
      signUpForceRedirectUrl: "/onboarding/username",
      signInForceRedirectUrl: signInDest,
      continueSignUpUrl: "/onboarding/username",
    }).catch(() => {
      router.replace("/");
    });
  }, [handleRedirectCallback, router]);

  return (
    <div style={{
      display: "flex",
      height: "100vh",
      alignItems: "center",
      justifyContent: "center",
      background: "var(--bg, #FFFBF1)",
    }}>
      <svg width="32" height="32" viewBox="0 0 24 24" style={{ animation: "spin 0.9s linear infinite" }}>
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        <circle cx="12" cy="12" r="10" stroke="#3A5A42" strokeWidth="2.5" fill="none" opacity="0.2" />
        <path d="M12 2a10 10 0 0 1 10 10" stroke="#3A5A42" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      </svg>
    </div>
  );
}

"use client";

import { useState } from "react";
import { useSignIn } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { Trees } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface SignInModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  switchToSignUp?: () => void;
}

export default function SignInModal({ open, onOpenChange, switchToSignUp }: SignInModalProps) {
  const { isLoaded, signIn, setActive } = useSignIn();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<"google" | "apple" | null>(null);
  const [needsMfa, setNeedsMfa] = useState(false);
  const [mfaCode, setMfaCode] = useState("");
  const [mfaStrategy, setMfaStrategy] = useState<"totp" | "phone_code" | "email_code">("totp");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoaded) return;

    setError("");
    setLoading(true);

    try {
      const result = await signIn.create({
        identifier: email,
        password,
      });

      if (result.status === "complete") {
        await setActive({ session: result.createdSessionId });
        onOpenChange(false);
        router.push("/dashboard");
        router.refresh();
      } else if (result.status === "needs_second_factor") {
        const supported = result.supportedSecondFactors ?? [];
        const emailFactor = supported.find((f: { strategy: string }) => f.strategy === "email_code") as { emailAddressId: string } | undefined;
        const phoneFactor = supported.find((f: { strategy: string }) => f.strategy === "phone_code") as { phoneNumberId: string } | undefined;
        if (emailFactor) {
          await signIn.prepareSecondFactor({ strategy: "email_code", emailAddressId: emailFactor.emailAddressId });
          setMfaStrategy("email_code");
        } else if (phoneFactor) {
          await signIn.prepareSecondFactor({ strategy: "phone_code", phoneNumberId: phoneFactor.phoneNumberId });
          setMfaStrategy("phone_code");
        } else {
          setMfaStrategy("totp");
        }
        setNeedsMfa(true);
      } else {
        setError("Sign in incomplete. Please try again.");
      }
    } catch (err: unknown) {
      const error = err as { errors?: Array<{ message?: string }> };
      setError(error?.errors?.[0]?.message || "An error occurred during sign in");
    } finally {
      setLoading(false);
    }
  };

  const handleMfa = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoaded) return;

    setError("");
    setLoading(true);

    try {
      const result = await signIn.attemptSecondFactor({ strategy: mfaStrategy, code: mfaCode });
      if (result.status === "complete") {
        await setActive({ session: result.createdSessionId });
        onOpenChange(false);
        router.push("/dashboard");
        router.refresh();
      } else {
        setError("Verification incomplete. Please try again.");
      }
    } catch (err: unknown) {
      const error = err as { errors?: Array<{ message?: string }> };
      setError(error?.errors?.[0]?.message || "Invalid code");
    } finally {
      setLoading(false);
    }
  };

  const handleOAuth = async (provider: "oauth_google" | "oauth_apple") => {
    if (!isLoaded || !signIn) return;
  
    // Set loading status for provider for icon spinner
    setOauthLoading(provider === "oauth_google" ? "google" : "apple");
    
    try {
      await signIn.authenticateWithRedirect({
        strategy: provider,
        redirectUrl: "/",
        redirectUrlComplete: "/dashboard",
      });
    } catch (err: unknown) {
      const error = err as { errors?: Array<{ message?: string }> };
      setError(error?.errors?.[0]?.message || "An error occurred during authentication");
    }
  };

  if (needsMfa) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader className="space-y-4">
            <div className="flex items-center justify-center gap-2">
              <Trees className="w-8 h-8 text-green-600" />
              <DialogTitle className="text-2xl font-bold text-gray-900">ParkQuest</DialogTitle>
            </div>
            <DialogDescription className="text-center text-base">
              {mfaStrategy === "email_code"
                ? `Enter the code sent to ${email}`
                : mfaStrategy === "phone_code"
                ? "Enter the code sent to your phone"
                : "Enter your authenticator app code"}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleMfa} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="mfa-code">Verification Code</Label>
              <Input
                id="mfa-code"
                type="text"
                placeholder="6-digit code"
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value)}
                required
                disabled={loading || !isLoaded}
                className="w-full tracking-widest"
                maxLength={6}
                autoFocus
              />
            </div>
            {error && (
              <div className="text-sm text-red-600 bg-red-50 p-3 rounded-md">
                {error}
              </div>
            )}
            <Button
              type="submit"
              className="w-full bg-green-600 hover:bg-green-700 text-white hover:cursor-pointer"
              disabled={loading || !isLoaded}
            >
              {loading ? "Verifying..." : "Verify"}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => {
                setNeedsMfa(false);
                setMfaCode("");
                setError("");
              }}
            >
              Back
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="space-y-4">
          <div className="flex items-center justify-center gap-2">
            <Trees className="w-8 h-8 text-green-600" />
            <DialogTitle className="text-2xl font-bold text-gray-900">ParkQuest</DialogTitle>
          </div>
          <DialogDescription className="text-center text-base">
            Sign in to continue your national park adventure
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">

          {/* OAuth Buttons */}
          <div className="grid grid-cols-2 gap-3">

            {/* Google */}
            <Button
              type="button"
              variant="outline"
              className="w-full hover:cursor-pointer"
              onClick={() => handleOAuth("oauth_google")}
              disabled={!isLoaded}
            >
              {oauthLoading === "google" ? (
                <svg className="w-5 h-5 mr-2 animate-spin" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
              ) : (
                <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
              )}
              Google
            </Button>

            {/* Apple */}
            <Button
              type="button"
              variant="outline"
              className="w-full hover:cursor-pointer"
              onClick={() => handleOAuth("oauth_apple")}
              disabled={!isLoaded}
            >
              {oauthLoading === "apple" ? (
                <svg className="w-5 h-5 mr-2 animate-spin" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
              ) :(
                <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
                </svg>
              )}
              Apple
            </Button>
          </div>

          {/* Divider */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white px-2 text-gray-500">Or continue with</span>
            </div>
          </div>

          {/* Email/Password Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="Enter your email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading || !isLoaded}
                className="w-full"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading || !isLoaded}
                className="w-full"
              />
            </div>
            {error && (
              <div className="text-sm text-red-600 bg-red-50 p-3 rounded-md">
                {error}
              </div>
            )}

            {/* Clerk CAPTCHA element */}
            <div id="clerk-captcha" className="flex justify-center my-4"></div>

            <Button
              type="submit"
              className="w-full bg-green-600 hover:bg-green-700 text-white hover:cursor-pointer"
              disabled={loading || !isLoaded}
            >
              {loading ? "Signing in..." : "Sign In"}
            </Button>
            {switchToSignUp && (
              <div className="text-center text-sm text-gray-600">
                Don&apos;t have an account?{" "}
                <button
                  type="button"
                  onClick={() => {
                    onOpenChange(false);
                    switchToSignUp();
                  }}
                  className="text-green-600 hover:text-green-700 font-medium hover:cursor-pointer"
                >
                  Sign up
                </button>
              </div>
            )}
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}


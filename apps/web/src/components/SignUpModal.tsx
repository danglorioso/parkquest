"use client";

import { useState } from "react";
import { useSignUp } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { Trees } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Step = "email" | "password" | "verify";

interface SignUpModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  switchToSignIn?: () => void;
}

export default function SignUpModal({ open, onOpenChange, switchToSignIn }: SignUpModalProps) {
  const { isLoaded, signUp, setActive } = useSignUp();
  const router = useRouter();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [code, setCode] = useState("");
  const [oauthLoading, setOauthLoading] = useState<"google" | "apple" | null>(null);

  const resetForm = () => {
    setStep("email");
    setEmail("");
    setPassword("");
    setFirstName("");
    setLastName("");
    setError("");
    setCode("");
  };

  const handleEmailContinue = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setError("");
    setStep("password");
  };

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoaded) return;

    setError("");
    setLoading(true);

    try {
      await signUp.create({
        emailAddress: email,
        password,
        firstName: firstName || undefined,
        lastName: lastName || undefined,
      });

      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
      setStep("verify");
    } catch (err: unknown) {
      const error = err as { errors?: Array<{ message?: string }> };
      setError(error?.errors?.[0]?.message || "An error occurred during sign up");
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoaded) return;

    setError("");
    setLoading(true);

    try {
      const completeSignUp = await signUp.attemptEmailAddressVerification({ code });

      if (completeSignUp.status === "complete") {
        await setActive({ session: completeSignUp.createdSessionId });
        onOpenChange(false);
        resetForm();
        router.push("/map");
        router.refresh();
      } else {
        setError("Verification incomplete. Please try again.");
      }
    } catch (err: unknown) {
      const error = err as { errors?: Array<{ message?: string }> };
      setError(error?.errors?.[0]?.message || "Verification code is incorrect");
    } finally {
      setLoading(false);
    }
  };

  const handleOAuth = async (provider: "oauth_google" | "oauth_apple") => {
    if (!isLoaded || !signUp) return;
    setOauthLoading(provider === "oauth_google" ? "google" : "apple");

    try {
      await signUp.authenticateWithRedirect({
        strategy: provider,
        redirectUrl: "/sso-callback",
        redirectUrlComplete: "/onboarding/username",
      });
    } catch (err: unknown) {
      const error = err as { errors?: Array<{ message?: string }> };
      setError(error?.errors?.[0]?.message || "An error occurred during authentication");
    }
  };

  const GoogleIcon = ({ spinning }: { spinning: boolean }) =>
    spinning ? (
      <svg className="w-5 h-5 mr-2 animate-spin" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
      </svg>
    ) : (
      <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
      </svg>
    );

  const AppleIcon = ({ spinning }: { spinning: boolean }) =>
    spinning ? (
      <svg className="w-5 h-5 mr-2 animate-spin" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
      </svg>
    ) : (
      <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24" fill="currentColor">
        <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
      </svg>
    );

  const OAuthButtons = () => (
    <>
      <div className="grid grid-cols-2 gap-3">
        <Button type="button" variant="outline" className="w-full hover:cursor-pointer" onClick={() => handleOAuth("oauth_google")} disabled={!isLoaded}>
          <GoogleIcon spinning={oauthLoading === "google"} />
          Google
        </Button>
        <Button type="button" variant="outline" className="w-full hover:cursor-pointer" onClick={() => handleOAuth("oauth_apple")} disabled={!isLoaded}>
          <AppleIcon spinning={oauthLoading === "apple"} />
          Apple
        </Button>
      </div>
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-white px-2 text-gray-500">Or continue with email</span>
        </div>
      </div>
    </>
  );

  const SignInLink = () =>
    switchToSignIn ? (
      <div className="text-center text-sm text-gray-600">
        Already have an account?{" "}
        <button
          type="button"
          onClick={() => { onOpenChange(false); switchToSignIn(); }}
          className="text-green-600 hover:text-green-700 font-medium hover:cursor-pointer"
        >
          Sign in
        </button>
      </div>
    ) : null;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) resetForm(); onOpenChange(o); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="space-y-4">
          <div className="flex items-center justify-center gap-2">
            <Trees className="w-8 h-8 text-green-600" />
            <DialogTitle className="text-2xl font-bold text-gray-900">ParkQuest</DialogTitle>
          </div>
          <DialogDescription className="text-center text-base">
            {step === "email" && "Start tracking your national park adventures"}
            {step === "password" && "Create a password for your account"}
            {step === "verify" && "Verify your email address"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Step 1: Email */}
          {step === "email" && (
            <>
              <OAuthButtons />
              <form onSubmit={handleEmailContinue} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">First Name</Label>
                    <Input
                      id="firstName"
                      type="text"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      disabled={loading || !isLoaded}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName">Last Name</Label>
                    <Input
                      id="lastName"
                      type="text"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      disabled={loading || !isLoaded}
                    />
                  </div>
                </div>
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
                  />
                </div>
                {error && <div className="text-sm text-red-600 bg-red-50 p-3 rounded-md">{error}</div>}
                <Button type="submit" className="w-full bg-green-600 hover:bg-green-700 text-white hover:cursor-pointer" disabled={!isLoaded}>
                  Continue
                </Button>
                <SignInLink />
              </form>
            </>
          )}

          {/* Step 2: Password */}
          {step === "password" && (
            <form onSubmit={handleCreateAccount} className="space-y-4">
              <p className="text-sm text-gray-500 text-center">Creating account for <span className="font-medium text-gray-700">{email}</span></p>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoFocus
                  disabled={loading || !isLoaded}
                />
              </div>
              {/* clerk-captcha must be in the DOM when signUp.create() is called */}
              <div id="clerk-captcha" />
              {error && <div className="text-sm text-red-600 bg-red-50 p-3 rounded-md">{error}</div>}
              <Button type="submit" className="w-full bg-green-600 hover:bg-green-700 text-white hover:cursor-pointer" disabled={loading || !isLoaded}>
                {loading ? "Creating account..." : "Create Account"}
              </Button>
              <Button type="button" variant="outline" className="w-full" onClick={() => { setStep("email"); setError(""); setPassword(""); }}>
                Back
              </Button>
            </form>
          )}

          {/* Step 3: Email Verification */}
          {step === "verify" && (
            <form onSubmit={handleVerify} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="code">Verification Code</Label>
                <Input
                  id="code"
                  type="text"
                  placeholder="Enter verification code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  required
                  autoFocus
                  disabled={loading || !isLoaded}
                />
                <p className="text-xs text-gray-500">We sent a verification code to {email}</p>
              </div>
              {error && <div className="text-sm text-red-600 bg-red-50 p-3 rounded-md">{error}</div>}
              <Button type="submit" className="w-full bg-green-600 hover:bg-green-700 text-white" disabled={loading || !isLoaded}>
                {loading ? "Verifying..." : "Verify Email"}
              </Button>
              <Button type="button" variant="outline" className="w-full" onClick={() => { setStep("password"); setCode(""); setError(""); }}>
                Back
              </Button>
            </form>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { useRef, useState, useEffect } from "react";
import { useUser, useClerk } from "@clerk/nextjs";
import { X, Camera, Loader2, Mail, TriangleAlert } from "lucide-react";
import { useToast } from "@/components/ToastProvider";
import { useRouter } from "next/navigation";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

const INPUT: React.CSSProperties = {
  width: "100%",
  background: "var(--surface)",
  border: "0.5px solid var(--hairline)",
  borderRadius: 8,
  padding: "9px 12px",
  fontSize: 13.5,
  color: "var(--ink)",
  outline: "none",
  fontFamily: "inherit",
  boxSizing: "border-box",
};

function Field({ label, children, error }: { label: string; children: React.ReactNode; error?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <label style={{ fontWeight: 600, fontSize: 12, color: "var(--ink)" }}>{label}</label>
      {children}
      {error && <span style={{ fontSize: 11, color: "#C04040" }}>{error}</span>}
    </div>
  );
}

export default function EditProfileDialog({ open, onOpenChange, onSaved }: Props) {
  const { user } = useUser();
  const { signOut } = useClerk();
  const { toast } = useToast();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [firstName, setFirstName] = useState("");
  const [lastName,  setLastName]  = useState("");
  const [username,  setUsername]  = useState("");
  const [bio,       setBio]       = useState("");
  const [email,     setEmail]     = useState("");
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarFile,    setAvatarFile]    = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState("");
  const [usernameError, setUsernameError] = useState("");
  const [emailSent, setEmailSent] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmInput, setDeleteConfirmInput] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [connectBusy, setConnectBusy] = useState<"google" | "apple" | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState<"google" | "apple" | null>(null);
  const [showSetPassword, setShowSetPassword] = useState(false);
  const [pendingDisconnect, setPendingDisconnect] = useState<"google" | "apple" | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [settingPassword, setSettingPassword] = useState(false);

  // Escape key to close
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving && !deleting) onOpenChange(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, saving, onOpenChange]);

  // Load current values whenever dialog opens
  useEffect(() => {
    if (!open || !user) return;
    setFirstName(user.firstName ?? "");
    setLastName(user.lastName ?? "");
    setUsername(user.username ?? "");
    setEmail(user.primaryEmailAddress?.emailAddress ?? "");
    setAvatarPreview(null);
    setAvatarFile(null);
    setError("");
    setUsernameError("");
    setEmailSent(false);
    setShowDeleteConfirm(false);
    setDeleteConfirmInput("");
    setConfirmDisconnect(null);
    setShowSetPassword(false);
    setPendingDisconnect(null);
    setNewPassword("");
    setConfirmPassword("");
    setPasswordError("");
    fetch("/api/profile")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => data && setBio(data.bio ?? ""))
      .catch(() => {});
  }, [open, user]);

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  };

  const validateUsername = (val: string) => {
    if (val.length < 3) return "Username must be at least 3 characters";
    return "";
  };

  const handleSave = async () => {
    if (!user) return;
    const uErr = validateUsername(username.trim());
    if (uErr) { setUsernameError(uErr); return; }

    setError("");
    setUsernameError("");
    setSaving(true);
    try {
      if (avatarFile) {
        try { await user.setProfileImage({ file: avatarFile }); } catch { /* ignore */ }
      }
      try {
        await user.update({ firstName: firstName.trim(), lastName: lastName.trim() });
      } catch { /* ignore */ }

      // Handle email change — Clerk sends a verification link to the new address
      const currentEmail = user.primaryEmailAddress?.emailAddress ?? "";
      const newEmail = email.trim();
      if (newEmail && newEmail !== currentEmail) {
        try {
          const addr = await user.createEmailAddress({ email: newEmail });
          await addr.prepareVerification({ strategy: "email_link", redirectUrl: window.location.origin });
          setEmailSent(true);
        } catch (err: unknown) {
          setError(err instanceof Error ? err.message : "Failed to initiate email change");
          setSaving(false);
          return;
        }
      }

      // DB save
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: username.trim().toLowerCase(),
          display_name: [firstName.trim(), lastName.trim()].filter(Boolean).join(" ") || null,
          bio: bio.trim() || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        const msg: string = data.error ?? "Failed to save";
        if (msg.toLowerCase().includes("username")) {
          setUsernameError(msg);
        } else {
          setError(msg);
        }
        return;
      }

      onSaved?.();
      toast(emailSent ? "Profile saved — check your email to verify the new address" : "Profile saved");
      if (!emailSent) onOpenChange(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  };

  const googleAccount = user?.verifiedExternalAccounts.find((a) => a.provider === "google") ?? null;
  const appleAccount  = user?.verifiedExternalAccounts.find((a) => a.provider === "apple")  ?? null;

  // A provider can only be disconnected if another sign-in method survives it —
  // a password, or another connected SSO account — otherwise the user is locked out.
  const canUnlink = (provider: "google" | "apple") => {
    if (!user) return false;
    if (user.passwordEnabled) return true;
    return user.verifiedExternalAccounts.some((a) => a.provider !== provider);
  };

  const closeSetPassword = () => {
    setShowSetPassword(false);
    setPendingDisconnect(null);
    setNewPassword("");
    setConfirmPassword("");
    setPasswordError("");
  };

  const performDisconnect = async (provider: "google" | "apple") => {
    const acct = provider === "google" ? googleAccount : appleAccount;
    if (!acct) return;
    setConnectBusy(provider);
    try {
      await acct.destroy();
      await user?.reload();
      toast(`${provider === "google" ? "Google" : "Apple"} account disconnected`);
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "Failed to disconnect account", "error");
    } finally {
      setConnectBusy(null);
    }
  };

  const handleDisconnectPress = (provider: "google" | "apple") => {
    if (!canUnlink(provider)) {
      setPendingDisconnect(provider);
      setShowSetPassword(true);
      return;
    }
    setConfirmDisconnect(provider);
  };

  const handleConnect = async (provider: "google" | "apple") => {
    if (!user) return;
    setConnectBusy(provider);
    try {
      sessionStorage.setItem("pq_link_return", window.location.pathname);
      const acct = await user.createExternalAccount({
        strategy: provider === "google" ? "oauth_google" : "oauth_apple",
        redirectUrl: `${window.location.origin}/account/link-callback`,
      });
      const url = acct.verification?.externalVerificationRedirectURL;
      if (!url) throw new Error("Could not start sign-in");
      router.push(url.href);
    } catch (err: unknown) {
      setConnectBusy(null);
      toast(err instanceof Error ? err.message : "Failed to connect account", "error");
    }
  };

  const handleSetPassword = async () => {
    if (!user) return;
    if (newPassword.length < 8) { setPasswordError("Password must be at least 8 characters"); return; }
    if (newPassword !== confirmPassword) { setPasswordError("Passwords do not match"); return; }
    setPasswordError("");
    setSettingPassword(true);
    try {
      await user.updatePassword({ newPassword });
      const provider = pendingDisconnect;
      closeSetPassword();
      toast("Password set");
      if (provider) await performDisconnect(provider);
    } catch (err: unknown) {
      setPasswordError(err instanceof Error ? err.message : "Failed to set password");
    } finally {
      setSettingPassword(false);
    }
  };

  const handleDelete = async () => {
    if (!user || deleteConfirmInput !== user.username) return;
    setDeleting(true);
    try {
      const res = await fetch("/api/account", { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to delete account");
      await signOut();
      router.replace("/");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to delete account");
      setDeleting(false);
    }
  };

  if (!open) return null;

  const displayAvatar = avatarPreview ?? user?.imageUrl ?? null;
  const initials = ([firstName[0], lastName[0]].filter(Boolean).join("").toUpperCase() || user?.username?.[0]?.toUpperCase()) ?? "?";

  return (
    <div
      onClick={() => !saving && !deleting && onOpenChange(false)}
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        background: "rgba(0,0,0,0.48)",
        display: "flex", alignItems: "center", justifyContent: "center",
        backdropFilter: "blur(4px)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 440,
          maxHeight: "90vh",
          background: "var(--bg)",
          border: "0.5px solid var(--hairline)",
          borderRadius: 16,
          boxShadow: "0 24px 60px rgba(0,0,0,0.22)",
          overflow: "hidden",
          display: "flex", flexDirection: "column",
          animation: "pqEditProfile 200ms cubic-bezier(.2,.7,.3,1)",
        }}
      >
        <style>{`@keyframes pqEditProfile { from { opacity:0; transform:translateY(8px) scale(0.98) } to { opacity:1; transform:translateY(0) scale(1) } }`}</style>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 20px 14px", borderBottom: "0.5px solid var(--hairline-soft)" }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 16, color: "var(--ink)" }}>Edit account</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, letterSpacing: "1.2px", color: "var(--ink-mute)", marginTop: 2 }}>PROFILE &amp; PREFERENCES</div>
          </div>
          <button
            onClick={() => !saving && !deleting && onOpenChange(false)}
            style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--surface-alt)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--ink-soft)" }}
          >
            <X style={{ width: 14, height: 14 }} strokeWidth={2.2} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: 18, overflowY: "auto", flex: 1 }}>

          {/* Avatar */}
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ position: "relative", flexShrink: 0 }}>
              {displayAvatar ? (
                <img src={displayAvatar} alt="avatar" style={{ width: 64, height: 64, borderRadius: "50%", objectFit: "cover", border: "2px solid var(--hairline)" }} />
              ) : (
                <div style={{ width: 64, height: 64, borderRadius: "50%", background: "var(--surface-alt)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 22, color: "var(--ink-mute)", border: "2px solid var(--hairline)" }}>
                  {initials}
                </div>
              )}
              <button
                onClick={() => fileRef.current?.click()}
                style={{ position: "absolute", bottom: 0, right: 0, width: 22, height: 22, borderRadius: "50%", background: "var(--primary)", border: "2px solid var(--bg)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
              >
                <Camera style={{ width: 11, height: 11, color: "#FFFBF1" }} strokeWidth={2.2} />
              </button>
              <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleAvatarChange} />
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: 13, color: "var(--ink)" }}>Profile photo</div>
              <div style={{ fontSize: 11.5, color: "var(--ink-mute)", marginTop: 2 }}>Click the camera to upload a new photo</div>
            </div>
          </div>

          {/* Name row */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="First name">
              <input
                style={INPUT}
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                maxLength={50}
                placeholder="First"
                onFocus={(e) => { e.currentTarget.style.borderColor = "var(--primary)"; e.currentTarget.style.boxShadow = "0 0 0 2px rgba(47,122,74,0.12)"; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = ""; e.currentTarget.style.boxShadow = ""; }}
              />
            </Field>
            <Field label="Last name">
              <input
                style={INPUT}
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                maxLength={50}
                placeholder="Last"
                onFocus={(e) => { e.currentTarget.style.borderColor = "var(--primary)"; e.currentTarget.style.boxShadow = "0 0 0 2px rgba(47,122,74,0.12)"; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = ""; e.currentTarget.style.boxShadow = ""; }}
              />
            </Field>
          </div>

          {/* Username */}
          <Field label="Username" error={usernameError}>
            <div style={{ display: "flex", alignItems: "center" }}>
              <span style={{ padding: "9px 10px", background: "var(--surface-alt)", border: "0.5px solid var(--hairline)", borderRight: "none", borderRadius: "8px 0 0 8px", fontSize: 13.5, color: "var(--ink-mute)", fontWeight: 600, flexShrink: 0 }}>@</span>
              <input
                style={{ ...INPUT, borderRadius: "0 8px 8px 0", borderLeft: "none" }}
                value={username}
                onChange={(e) => { setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "")); setUsernameError(""); }}
                onBlur={() => { const e = validateUsername(username.trim()); if (e) setUsernameError(e); }}
                maxLength={20}
                placeholder="username"
                onFocus={(e) => { e.currentTarget.style.borderColor = "var(--primary)"; e.currentTarget.style.boxShadow = "0 0 0 2px rgba(47,122,74,0.12)"; }}
              />
            </div>
          </Field>

          {/* Bio */}
          <Field label="Bio">
            <div style={{ position: "relative" }}>
              <textarea
                style={{ ...INPUT, resize: "none", lineHeight: 1.5, paddingBottom: 22 } as React.CSSProperties}
                rows={3}
                maxLength={200}
                placeholder="A short description about yourself…"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                onFocus={(e) => { e.currentTarget.style.borderColor = "var(--primary)"; e.currentTarget.style.boxShadow = "0 0 0 2px rgba(47,122,74,0.12)"; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = ""; e.currentTarget.style.boxShadow = ""; }}
              />
              <span style={{ position: "absolute", bottom: 8, right: 10, fontSize: 10, color: "var(--ink-mute)", fontFamily: "var(--font-mono)" }}>{bio.length}/200</span>
            </div>
          </Field>

          {/* Email */}
          {emailSent ? (
            <div style={{ display: "flex", gap: 10, padding: "12px 14px", background: "rgba(47,122,74,0.07)", border: "0.5px solid rgba(47,122,74,0.25)", borderRadius: 10, alignItems: "flex-start" }}>
              <Mail style={{ width: 15, height: 15, color: "var(--primary)", flexShrink: 0, marginTop: 1 }} strokeWidth={2} />
              <div style={{ fontSize: 12.5, color: "var(--ink)", lineHeight: 1.5 }}>
                A verification link was sent to <strong>{email}</strong>. Click it to confirm the change — your current email stays active until then.
              </div>
            </div>
          ) : (
            <Field label="Email">
              <input
                style={INPUT}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                onFocus={(e) => { e.currentTarget.style.borderColor = "var(--primary)"; e.currentTarget.style.boxShadow = "0 0 0 2px rgba(47,122,74,0.12)"; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = ""; e.currentTarget.style.boxShadow = ""; }}
              />
            </Field>
          )}

          {/* Connected accounts */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label style={{ fontWeight: 600, fontSize: 12, color: "var(--ink)" }}>Connected accounts</label>
            {(["google", "apple"] as const).map((provider) => {
              const acct = provider === "google" ? googleAccount : appleAccount;
              const busy = connectBusy === provider;
              const label = provider === "google" ? "Google" : "Apple";
              return (
                <div key={provider} style={{ display: "flex", flexDirection: "column", gap: 8, background: "var(--surface-alt)", border: "0.5px solid var(--hairline)", borderRadius: 10, padding: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ width: 22, display: "flex", justifyContent: "center", flexShrink: 0 }}>
                      {provider === "google" ? (
                        <svg width="18" height="18" viewBox="0 0 24 24">
                          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                        </svg>
                      ) : (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="var(--ink)">
                          <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
                        </svg>
                      )}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)" }}>{label}</div>
                      <div style={{ fontSize: 11.5, color: "var(--ink-mute)" }}>{acct ? "Connected" : "Not connected"}</div>
                    </div>
                    <button
                      onClick={() => (acct ? handleDisconnectPress(provider) : handleConnect(provider))}
                      disabled={busy}
                      style={{
                        padding: "7px 14px", borderRadius: 8, fontSize: 12.5, fontWeight: 700,
                        border: `1.5px solid ${acct ? "#C04040" : "var(--primary)"}`,
                        background: "transparent",
                        color: acct ? "#C04040" : "var(--primary)",
                        cursor: busy ? "wait" : "pointer",
                        opacity: busy ? 0.5 : 1,
                        display: "flex", alignItems: "center", gap: 6,
                      }}
                    >
                      {busy && <Loader2 style={{ width: 12, height: 12 }} className="animate-spin" />}
                      {acct ? "Disconnect" : "Connect"}
                    </button>
                  </div>
                  {confirmDisconnect === provider && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 11.5, color: "var(--ink-mute)", flex: 1 }}>
                        Sign in with {label} will no longer work.
                      </span>
                      <button
                        onClick={() => setConfirmDisconnect(null)}
                        style={{ padding: "6px 12px", borderRadius: 7, border: "0.5px solid var(--hairline)", background: "var(--surface)", color: "var(--ink)", fontWeight: 600, fontSize: 11.5, cursor: "pointer" }}
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => { setConfirmDisconnect(null); performDisconnect(provider); }}
                        style={{ padding: "6px 12px", borderRadius: 7, border: "none", background: "#C04040", color: "#fff", fontWeight: 700, fontSize: 11.5, cursor: "pointer" }}
                      >
                        Disconnect
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
            {showSetPassword && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: 14, background: "rgba(47,122,74,0.05)", border: "0.5px solid rgba(47,122,74,0.25)", borderRadius: 10 }}>
                <p style={{ margin: 0, fontSize: 12, color: "var(--ink)", lineHeight: 1.5 }}>
                  That&apos;s your only way to sign in right now. Set a password first so disconnecting it doesn&apos;t lock you out.
                </p>
                <Field label="New password">
                  <input
                    type="password"
                    style={INPUT}
                    value={newPassword}
                    onChange={(e) => { setNewPassword(e.target.value); setPasswordError(""); }}
                    placeholder="At least 8 characters"
                  />
                </Field>
                <Field label="Confirm password">
                  <input
                    type="password"
                    style={INPUT}
                    value={confirmPassword}
                    onChange={(e) => { setConfirmPassword(e.target.value); setPasswordError(""); }}
                    placeholder="Re-enter password"
                  />
                </Field>
                {passwordError && <span style={{ fontSize: 11, color: "#C04040" }}>{passwordError}</span>}
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={closeSetPassword}
                    disabled={settingPassword}
                    style={{ flex: 1, padding: "8px 0", borderRadius: 8, border: "0.5px solid var(--hairline)", background: "var(--surface-alt)", color: "var(--ink)", fontWeight: 600, fontSize: 12.5, cursor: "pointer" }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSetPassword}
                    disabled={settingPassword || !newPassword || !confirmPassword}
                    style={{
                      flex: 1, padding: "8px 0", borderRadius: 8, border: "none", background: "var(--primary)", color: "#FFFBF1", fontWeight: 700, fontSize: 12.5,
                      cursor: (settingPassword || !newPassword || !confirmPassword) ? "not-allowed" : "pointer",
                      opacity: (settingPassword || !newPassword || !confirmPassword) ? 0.5 : 1,
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                    }}
                  >
                    {settingPassword && <Loader2 style={{ width: 12, height: 12 }} className="animate-spin" />}
                    {settingPassword ? "Setting…" : "Set password"}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Danger zone */}
          <div style={{ borderTop: "0.5px solid var(--hairline-soft)", paddingTop: 16 }}>
            {!showDeleteConfirm ? (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                disabled={saving}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 8, border: "0.5px solid rgba(192,64,64,0.35)", background: "rgba(192,64,64,0.05)", color: "#C04040", fontSize: 12.5, fontWeight: 600, cursor: "pointer", width: "100%" }}
              >
                <TriangleAlert style={{ width: 13, height: 13, flexShrink: 0 }} strokeWidth={2.2} />
                Delete account
              </button>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "14px", background: "rgba(192,64,64,0.05)", border: "0.5px solid rgba(192,64,64,0.25)", borderRadius: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <TriangleAlert style={{ width: 13, height: 13, color: "#C04040", flexShrink: 0 }} strokeWidth={2.2} />
                  <span style={{ fontWeight: 700, fontSize: 12.5, color: "#C04040" }}>This cannot be undone</span>
                </div>
                <p style={{ margin: 0, fontSize: 12, color: "var(--ink-mute)", lineHeight: 1.5 }}>
                  All your visits, posts, badges, and account data will be permanently deleted. Type your username <strong style={{ color: "var(--ink)" }}>@{user?.username}</strong> to confirm.
                </p>
                <input
                  style={{ ...INPUT, borderColor: "rgba(192,64,64,0.4)" }}
                  placeholder={`@${user?.username ?? "username"}`}
                  value={deleteConfirmInput}
                  onChange={(e) => setDeleteConfirmInput(e.target.value)}
                  autoFocus
                />
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmInput(""); }}
                    disabled={deleting}
                    style={{ flex: 1, padding: "8px 0", borderRadius: 8, border: "0.5px solid var(--hairline)", background: "var(--surface-alt)", color: "var(--ink)", fontWeight: 600, fontSize: 12.5, cursor: "pointer" }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleDelete}
                    disabled={deleting || deleteConfirmInput !== user?.username}
                    style={{ flex: 1, padding: "8px 0", borderRadius: 8, border: "none", background: "#C04040", color: "#fff", fontWeight: 700, fontSize: 12.5, cursor: (deleting || deleteConfirmInput !== user?.username) ? "not-allowed" : "pointer", opacity: (deleting || deleteConfirmInput !== user?.username) ? 0.5 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
                  >
                    {deleting && <Loader2 style={{ width: 12, height: 12 }} className="animate-spin" />}
                    {deleting ? "Deleting…" : "Delete account"}
                  </button>
                </div>
              </div>
            )}
          </div>

          {error && (
            <div style={{ padding: "8px 12px", background: "rgba(192,64,64,0.08)", border: "0.5px solid rgba(192,64,64,0.25)", borderRadius: 8, fontSize: 12.5, color: "#C04040" }}>
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: "14px 20px", borderTop: "0.5px solid var(--hairline-soft)", display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button
            onClick={() => onOpenChange(false)}
            disabled={saving || deleting}
            style={{ padding: "9px 18px", borderRadius: 9, border: "0.5px solid var(--hairline)", background: "var(--surface-alt)", color: "var(--ink)", fontWeight: 600, fontSize: 13, cursor: "pointer" }}
          >
            {emailSent ? "Done" : "Cancel"}
          </button>
          {!emailSent && (
            <button
              onClick={handleSave}
              disabled={saving || username.trim().length < 3}
              style={{ padding: "9px 20px", borderRadius: 9, border: "none", background: "var(--primary)", color: "#FFFBF1", fontWeight: 700, fontSize: 13, cursor: saving ? "wait" : "pointer", display: "flex", alignItems: "center", gap: 7, opacity: (saving || username.trim().length < 3) ? 0.6 : 1 }}
            >
              {saving && <Loader2 style={{ width: 13, height: 13 }} className="animate-spin" />}
              {saving ? "Saving…" : "Save changes"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

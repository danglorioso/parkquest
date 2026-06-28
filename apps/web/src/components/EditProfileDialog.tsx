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
          background: "var(--bg)",
          border: "0.5px solid var(--hairline)",
          borderRadius: 16,
          boxShadow: "0 24px 60px rgba(0,0,0,0.22)",
          overflow: "hidden",
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
        <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: 18 }}>

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

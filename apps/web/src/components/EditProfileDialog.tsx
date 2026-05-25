"use client";

import { useRef, useState, useEffect } from "react";
import { useUser } from "@clerk/nextjs";
import { X, Camera, Loader2 } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
  overlayLeft?: number;
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

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <label style={{ fontWeight: 600, fontSize: 12, color: "var(--ink)" }}>{label}</label>
      {children}
      {hint && <span style={{ fontSize: 10.5, color: "var(--ink-mute)" }}>{hint}</span>}
    </div>
  );
}

export default function EditProfileDialog({ open, onOpenChange, onSaved, overlayLeft = 0 }: Props) {
  const { user } = useUser();
  const fileRef = useRef<HTMLInputElement>(null);

  const [firstName, setFirstName] = useState("");
  const [lastName,  setLastName]  = useState("");
  const [username,  setUsername]  = useState("");
  const [bio,       setBio]       = useState("");
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarFile,    setAvatarFile]    = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState("");

  // Load current values whenever dialog opens
  useEffect(() => {
    if (!open || !user) return;
    setFirstName(user.firstName ?? "");
    setLastName(user.lastName ?? "");
    setUsername(user.username ?? "");
    setAvatarPreview(null);
    setAvatarFile(null);
    setError("");
    // Fetch bio from our DB
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

  const handleSave = async () => {
    if (!user) return;
    setError("");
    setSaving(true);
    try {
      // Clerk-side updates — non-fatal if Clerk rejects (e.g. username feature disabled)
      if (avatarFile) {
        try { await user.setProfileImage({ file: avatarFile }); } catch { /* ignore */ }
      }
      try {
        await user.update({ firstName: firstName.trim(), lastName: lastName.trim() });
      } catch { /* ignore */ }

      // DB save — this is the authoritative source; errors here are shown to the user
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
        setError(data.error ?? "Failed to save");
        return;
      }

      onSaved?.();
      onOpenChange(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  const displayAvatar = avatarPreview ?? user?.imageUrl ?? null;
  const initials = ([firstName[0], lastName[0]].filter(Boolean).join("").toUpperCase() || user?.username?.[0]?.toUpperCase()) ?? "?";
  const email = user?.primaryEmailAddress?.emailAddress;

  return (
    <div
      onClick={() => !saving && onOpenChange(false)}
      style={{
        position: "fixed", top: 0, right: 0, bottom: 0, left: overlayLeft, zIndex: 200,
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
            onClick={() => !saving && onOpenChange(false)}
            style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--surface-alt)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--ink-soft)" }}
          >
            <X style={{ width: 14, height: 14 }} strokeWidth={2.2} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: 18, maxHeight: "60vh", overflowY: "auto" }}>

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
          <Field label="Username" hint="3–20 characters · letters, numbers, underscores">
            <div style={{ display: "flex", alignItems: "center" }}>
              <span style={{ padding: "9px 10px", background: "var(--surface-alt)", border: "0.5px solid var(--hairline)", borderRight: "none", borderRadius: "8px 0 0 8px", fontSize: 13.5, color: "var(--ink-mute)", fontWeight: 600, flexShrink: 0 }}>@</span>
              <input
                style={{ ...INPUT, borderRadius: "0 8px 8px 0", borderLeft: "none" }}
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                maxLength={20}
                placeholder="yourhandle"
                onFocus={(e) => { e.currentTarget.style.borderColor = "var(--primary)"; e.currentTarget.style.boxShadow = "0 0 0 2px rgba(47,122,74,0.12)"; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = ""; e.currentTarget.style.boxShadow = ""; }}
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

          {/* Email — read-only */}
          {email && (
            <Field label="Email" hint="Email changes are managed through account security.">
              <div style={{ ...INPUT, background: "var(--surface-alt)", color: "var(--ink-soft)", cursor: "default" }}>
                {email}
              </div>
            </Field>
          )}

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
            disabled={saving}
            style={{ padding: "9px 18px", borderRadius: 9, border: "0.5px solid var(--hairline)", background: "var(--surface-alt)", color: "var(--ink)", fontWeight: 600, fontSize: 13, cursor: "pointer" }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || username.trim().length < 3}
            style={{ padding: "9px 20px", borderRadius: 9, border: "none", background: "var(--primary)", color: "#FFFBF1", fontWeight: 700, fontSize: 13, cursor: saving ? "wait" : "pointer", display: "flex", alignItems: "center", gap: 7, opacity: (saving || username.trim().length < 3) ? 0.6 : 1 }}
          >
            {saving && <Loader2 style={{ width: 13, height: 13 }} className="animate-spin" />}
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

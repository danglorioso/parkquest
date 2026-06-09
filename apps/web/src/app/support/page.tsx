"use client";

import { useForm, ValidationError } from "@formspree/react";
import { ArrowRight, CheckCircle } from "lucide-react";
import Link from "next/link";

// ── Helpers ──────────────────────────────────────────────────────────────────

function topoPattern(color: string, opacity: number): string {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='420' height='420' viewBox='0 0 420 420'><g fill='none' stroke='${color}' stroke-opacity='${opacity}' stroke-width='1'><path d='M-20 60 Q 60 30 130 60 T 280 60 T 440 60'/><path d='M-20 110 Q 60 80 130 110 T 280 110 T 440 110'/><path d='M-20 160 Q 60 130 130 160 T 280 160 T 440 160'/><path d='M-20 210 Q 60 180 130 210 T 280 210 T 440 210'/><path d='M-20 260 Q 60 230 130 260 T 280 260 T 440 260'/><path d='M-20 310 Q 60 280 130 310 T 280 310 T 440 310'/><path d='M-20 360 Q 60 330 130 360 T 280 360 T 440 360'/><path d='M-20 410 Q 60 380 130 410 T 280 410 T 440 410'/></g></svg>`;
  return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
}

const ANIMATIONS = `
  @keyframes pqTopoDrift { 0% { background-position: 0 0 } 100% { background-position: 420px 200px } }
  @keyframes pqMountainDriftA { 0%,100% { transform: translateX(0) translateY(0) } 50% { transform: translateX(-1.2%) translateY(0.3%) } }
  @keyframes pqMountainDriftB { 0%,100% { transform: translateX(0) } 50% { transform: translateX(1%) } }
  @keyframes pqSunGlow { 0%,100% { opacity: 0.55; transform: scale(1) } 50% { opacity: 0.85; transform: scale(1.04) } }
`;

// ── Field components ──────────────────────────────────────────────────────────

function SField({
  label,
  name,
  type = "text",
  required = false,
  placeholder,
  errors,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
  errors?: ReturnType<typeof useForm>[0]["errors"];
}) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div
        style={{
          background: "var(--surface)",
          border: "0.5px solid var(--hairline)",
          borderRadius: 12,
          padding: "10px 14px",
        }}
      >
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            letterSpacing: "1.4px",
            color: "var(--ink-mute)",
            textTransform: "uppercase" as const,
            fontWeight: 600,
          }}
        >
          {label}
          {required && <span style={{ color: "var(--accent)", marginLeft: 3 }}>*</span>}
        </div>
        <input
          type={type}
          name={name}
          required={required}
          placeholder={placeholder}
          style={{
            border: 0,
            outline: "none",
            background: "transparent",
            fontFamily: "var(--font-sans)",
            fontWeight: 500,
            fontSize: 15,
            color: "var(--ink)",
            width: "100%",
            padding: "2px 0",
            marginTop: 2,
          }}
        />
      </div>
      {errors && (
        <ValidationError
          field={name}
          errors={errors}
          style={{ fontSize: 12, color: "var(--accent)", marginTop: 4, marginLeft: 2 }}
        />
      )}
    </div>
  );
}

function SSelect({
  label,
  name,
  required = false,
  options,
  errors,
}: {
  label: string;
  name: string;
  required?: boolean;
  options: { value: string; label: string }[];
  errors?: ReturnType<typeof useForm>[0]["errors"];
}) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div
        style={{
          background: "var(--surface)",
          border: "0.5px solid var(--hairline)",
          borderRadius: 12,
          padding: "10px 14px",
        }}
      >
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            letterSpacing: "1.4px",
            color: "var(--ink-mute)",
            textTransform: "uppercase" as const,
            fontWeight: 600,
          }}
        >
          {label}
          {required && <span style={{ color: "var(--accent)", marginLeft: 3 }}>*</span>}
        </div>
        <select
          name={name}
          required={required}
          defaultValue=""
          style={{
            border: 0,
            outline: "none",
            background: "transparent",
            fontFamily: "var(--font-sans)",
            fontWeight: 500,
            fontSize: 15,
            color: "var(--ink)",
            width: "100%",
            padding: "2px 0",
            marginTop: 2,
            appearance: "none" as const,
            cursor: "pointer",
          }}
        >
          <option value="" disabled style={{ color: "var(--ink-mute)" }}>
            Select one…
          </option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      {errors && (
        <ValidationError
          field={name}
          errors={errors}
          style={{ fontSize: 12, color: "var(--accent)", marginTop: 4, marginLeft: 2 }}
        />
      )}
    </div>
  );
}

function STextarea({
  label,
  name,
  required = false,
  placeholder,
  errors,
}: {
  label: string;
  name: string;
  required?: boolean;
  placeholder?: string;
  errors?: ReturnType<typeof useForm>[0]["errors"];
}) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div
        style={{
          background: "var(--surface)",
          border: "0.5px solid var(--hairline)",
          borderRadius: 12,
          padding: "10px 14px",
        }}
      >
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            letterSpacing: "1.4px",
            color: "var(--ink-mute)",
            textTransform: "uppercase" as const,
            fontWeight: 600,
          }}
        >
          {label}
          {required && <span style={{ color: "var(--accent)", marginLeft: 3 }}>*</span>}
        </div>
        <textarea
          name={name}
          required={required}
          placeholder={placeholder}
          rows={5}
          style={{
            border: 0,
            outline: "none",
            background: "transparent",
            fontFamily: "var(--font-sans)",
            fontWeight: 500,
            fontSize: 15,
            color: "var(--ink)",
            width: "100%",
            padding: "2px 0",
            marginTop: 2,
            resize: "vertical" as const,
            minHeight: 100,
          }}
        />
      </div>
      {errors && (
        <ValidationError
          field={name}
          errors={errors}
          style={{ fontSize: 12, color: "var(--accent)", marginTop: 4, marginLeft: 2 }}
        />
      )}
    </div>
  );
}

const INQUIRY_OPTIONS = [
  { value: "general", label: "General Question" },
  { value: "bug", label: "Bug Report" },
  { value: "feature", label: "Feature Request" },
  { value: "partnership", label: "Partnership / Business" },
  { value: "press", label: "Press / Media" },
  { value: "other", label: "Other" },
];

const REFERRAL_OPTIONS = [
  { value: "friend", label: "Friend / Word of Mouth" },
  { value: "app-store", label: "App Store" },
  { value: "social", label: "Social Media" },
  { value: "search", label: "Search Engine" },
  { value: "blog", label: "Blog / Article" },
  { value: "other", label: "Other" },
];

// ── Success state ─────────────────────────────────────────────────────────────

function SuccessPanel() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: "48px 0",
        gap: 16,
      }}
    >
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: "50%",
          background: "rgba(31,61,46,0.10)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <CheckCircle style={{ width: 32, height: 32, color: "var(--primary)" }} strokeWidth={1.8} />
      </div>
      <div
        style={{
          fontWeight: 800,
          fontSize: 26,
          color: "var(--ink)",
          letterSpacing: -0.6,
          marginTop: 4,
        }}
      >
        Message sent!
      </div>
      <div style={{ fontSize: 14, color: "var(--ink-mute)", lineHeight: 1.6, maxWidth: 320 }}>
        Thanks for reaching out. We&apos;ll get back to you within 1–2 business days.
      </div>
      <Link
        href="/"
        style={{
          marginTop: 12,
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          background: "var(--primary)",
          color: "#FFFBF1",
          border: "none",
          borderRadius: 12,
          padding: "12px 22px",
          fontSize: 13,
          fontWeight: 700,
          textDecoration: "none",
          boxShadow: "0 8px 22px rgba(31,61,46,0.20)",
        }}
      >
        Back to ParkQuest
        <ArrowRight style={{ width: 14, height: 14 }} strokeWidth={2.4} />
      </Link>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SupportPage() {
  const [state, handleSubmit] = useForm("mjgdrrla");

  return (
    <div
      className="flex flex-col md:flex-row md:h-screen md:overflow-hidden"
      style={{ minHeight: "100dvh" }}
    >
      <style>{ANIMATIONS}</style>

      {/* Mobile header */}
      <div
        className="md:hidden flex items-center justify-between px-6 py-5"
        style={{
          background: "var(--primary-deep)",
          borderBottom: "0.5px solid rgba(255,251,241,0.10)",
        }}
      >
        <Link
          href="/"
          style={{ color: "#FFFBF1", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6 }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 20L9 9l3 5 3-7 6 13H3z" />
            <circle cx="20" cy="4" r="3.5" fill="#FFFBF1" stroke="none" />
          </svg>
          <span style={{ fontWeight: 800, fontSize: 17, letterSpacing: -0.3 }}>
            Park<span style={{ fontWeight: 500 }}>Quest</span>
          </span>
        </Link>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9.5,
            letterSpacing: "1.6px",
            color: "rgba(255,251,241,0.60)",
            textTransform: "uppercase",
            fontWeight: 600,
          }}
        >
          SUPPORT
        </span>
      </div>

      {/* Left — hero panel (narrower than form) ─────────────────────────────── */}
      <div
        className="hidden md:flex flex-col justify-between"
        style={{
          width: 380,
          flexShrink: 0,
          background: "linear-gradient(180deg, var(--primary-deep) 0%, var(--primary) 100%)",
          position: "relative",
          overflow: "hidden",
          padding: "44px 44px",
        }}
      >
        {/* Topo overlay */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage: topoPattern("#FFFBF1", 0.14),
            backgroundSize: "420px 420px",
            animation: "pqTopoDrift 90s linear infinite",
            pointerEvents: "none",
          }}
        />

        {/* Sun glow */}
        <div
          style={{
            position: "absolute",
            right: "10%",
            top: "16%",
            width: 160,
            height: 160,
            borderRadius: "50%",
            background: "radial-gradient(circle, var(--accent-2) 0%, rgba(216,154,58,0.5) 30%, transparent 70%)",
            filter: "blur(8px)",
            animation: "pqSunGlow 8s ease-in-out infinite",
            pointerEvents: "none",
          }}
        />

        {/* Mountains */}
        <svg
          viewBox="0 0 600 800"
          preserveAspectRatio="xMidYMax slice"
          style={{
            position: "absolute",
            bottom: 0,
            left: "-5%",
            width: "110%",
            height: "60%",
            pointerEvents: "none",
          }}
        >
          <g style={{ animation: "pqMountainDriftA 18s ease-in-out infinite", transformOrigin: "center" }}>
            <path
              d="M0 800 L0 540 L80 430 L160 500 L240 340 L320 440 L400 300 L480 420 L560 360 L600 390 L600 800 Z"
              fill="rgba(0,0,0,0.20)"
            />
          </g>
          <path
            d="M0 800 L0 620 L100 540 L200 580 L280 500 L380 560 L460 500 L560 560 L600 540 L600 800 Z"
            fill="rgba(0,0,0,0.34)"
          />
          <path
            d="M0 800 L0 700 L120 660 L240 680 L360 650 L480 680 L600 660 L600 800 Z"
            fill="rgba(0,0,0,0.48)"
          />
        </svg>

        {/* Wordmark */}
        <div style={{ position: "relative", zIndex: 2 }}>
          <Link
            href="/"
            style={{
              color: "#FFFBF1",
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
            }}
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ marginTop: -2 }}
            >
              <path d="M3 20L9 9l3 5 3-7 6 13H3z" />
              <circle cx="20" cy="4" r="3.5" fill="#FFFBF1" stroke="none" />
            </svg>
            <span style={{ fontWeight: 800, fontSize: 19, letterSpacing: -0.4 }}>
              Park<span style={{ fontWeight: 500 }}>Quest</span>
            </span>
          </Link>
        </div>

        {/* Headline + tagline */}
        <div style={{ position: "relative", zIndex: 2 }}>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              letterSpacing: "2.2px",
              color: "rgba(255,251,241,0.60)",
              textTransform: "uppercase",
              fontWeight: 600,
              marginBottom: 12,
            }}
          >
            SUPPORT
          </div>
          <div
            style={{
              fontWeight: 800,
              fontSize: 38,
              color: "#FFFBF1",
              letterSpacing: -1.1,
              lineHeight: 1.0,
            }}
          >
            We&apos;re here<br />to help.
          </div>
          <div
            style={{
              fontSize: 14,
              color: "rgba(255,251,241,0.72)",
              lineHeight: 1.65,
              marginTop: 16,
            }}
          >
            Have a question, a bug to report, or just want to say hello? Fill out the form and we&apos;ll get back to you soon.
          </div>
        </div>

        {/* Copyright */}
        <div
          style={{
            position: "relative",
            zIndex: 2,
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            letterSpacing: "1.2px",
            color: "rgba(255,251,241,0.28)",
            fontWeight: 500,
          }}
        >
          © PARKQUEST {new Date().getFullYear()}
        </div>
      </div>

      {/* Right — form panel (wider, fills remaining space) ───────────────────── */}
      <div
        className="flex-1 px-6 py-10 md:px-[60px] md:py-[52px] overflow-y-auto"
        style={{
          background: "var(--bg)",
          borderLeft: "0.5px solid var(--hairline)",
        }}
      >
        <div style={{ maxWidth: 680, margin: "0 auto" }}>
          {state.succeeded ? (
            <SuccessPanel />
          ) : (
            <>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  letterSpacing: "2px",
                  color: "var(--ink-mute)",
                  textTransform: "uppercase",
                  fontWeight: 600,
                }}
              >
                CONTACT US
              </div>
              <div
                style={{
                  fontWeight: 800,
                  fontSize: 28,
                  color: "var(--ink)",
                  letterSpacing: -0.7,
                  marginTop: 8,
                  lineHeight: 1.05,
                }}
              >
                Send us a message.
              </div>
              <div style={{ fontSize: 13.5, color: "var(--ink-mute)", marginTop: 6, marginBottom: 32, lineHeight: 1.5 }}>
                Fields marked with <span style={{ color: "var(--accent)" }}>*</span> are required.
              </div>

              <form onSubmit={handleSubmit}>
                {/* Name row */}
                <div style={{ display: "flex", gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <SField label="First Name" name="firstName" required errors={state.errors} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <SField label="Last Name" name="lastName" required errors={state.errors} />
                  </div>
                </div>

                {/* Company */}
                <SField label="Company" name="company" placeholder="Optional" errors={state.errors} />

                {/* Email + Phone row */}
                <div style={{ display: "flex", gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <SField label="Email" name="email" type="email" required errors={state.errors} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <SField label="Phone" name="phone" type="tel" placeholder="Optional" errors={state.errors} />
                  </div>
                </div>

                {/* Inquiry type */}
                <SSelect
                  label="Inquiry Type"
                  name="inquiryType"
                  required
                  options={INQUIRY_OPTIONS}
                  errors={state.errors}
                />

                {/* Subject */}
                <SField label="Subject" name="subject" required errors={state.errors} />

                {/* Message */}
                <STextarea
                  label="Message"
                  name="message"
                  required
                  placeholder="Tell us what's on your mind…"
                  errors={state.errors}
                />

                {/* How did you hear about us */}
                <SSelect
                  label="How did you hear about us?"
                  name="referral"
                  options={REFERRAL_OPTIONS}
                  errors={state.errors}
                />

                {/* Form-level error */}
                <ValidationError
                  errors={state.errors}
                  style={{
                    background: "rgba(197,107,61,0.10)",
                    border: "0.5px solid rgba(197,107,61,0.30)",
                    borderRadius: 10,
                    padding: "10px 14px",
                    fontSize: 12.5,
                    color: "var(--accent)",
                    marginBottom: 14,
                    display: "block",
                  }}
                />

                {/* Submit */}
                <button
                  type="submit"
                  disabled={state.submitting}
                  style={{
                    width: "100%",
                    background: "var(--primary)",
                    color: "#FFFBF1",
                    border: "none",
                    borderRadius: 12,
                    padding: "14px 0",
                    fontSize: 14,
                    fontWeight: 700,
                    cursor: state.submitting ? "wait" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    boxShadow: "0 8px 22px rgba(31,61,46,0.25)",
                    opacity: state.submitting ? 0.7 : 1,
                    marginTop: 6,
                    transition: "opacity 150ms",
                  }}
                >
                  {state.submitting ? "Sending…" : "Send Message"}
                  {!state.submitting && (
                    <ArrowRight style={{ width: 16, height: 16 }} strokeWidth={2.4} />
                  )}
                </button>

                <div
                  style={{
                    marginTop: 20,
                    fontSize: 11.5,
                    color: "var(--ink-mute)",
                    textAlign: "center",
                    lineHeight: 1.5,
                  }}
                >
                  By submitting you agree to our{" "}
                  <Link href="/privacy" style={{ color: "var(--primary)", textDecoration: "none", fontWeight: 600 }}>
                    Privacy Policy
                  </Link>
                  .
                </div>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Delete Your Account",
  description: "How to request deletion of your ParkQuest account and data.",
};

function topoPattern(color: string, opacity: number): string {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='420' height='420' viewBox='0 0 420 420'><g fill='none' stroke='${color}' stroke-opacity='${opacity}' stroke-width='1'><path d='M-20 60 Q 60 30 130 60 T 280 60 T 440 60'/><path d='M-20 110 Q 60 80 130 110 T 280 110 T 440 110'/><path d='M-20 160 Q 60 130 130 160 T 280 160 T 440 160'/><path d='M-20 210 Q 60 180 130 210 T 280 210 T 440 210'/><path d='M-20 260 Q 60 230 130 260 T 280 260 T 440 260'/><path d='M-20 310 Q 60 280 130 310 T 280 310 T 440 310'/><path d='M-20 360 Q 60 330 130 360 T 280 360 T 440 360'/><path d='M-20 410 Q 60 380 130 410 T 280 410 T 440 410'/></g></svg>`;
  return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
}

export default function DeleteAccountPage() {
  return (
    <div style={{ minHeight: "100dvh", background: "var(--bg)", display: "flex", flexDirection: "column" }}>

      {/* ── Hero banner ────────────────────────────────────────────────────── */}
      <div
        style={{
          position: "relative",
          overflow: "hidden",
          height: "clamp(280px, 38vh, 460px)",
          background: "linear-gradient(180deg, var(--primary-deep) 0%, #3d8c61 60%)",
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
        }}
      >
        {/* Topo overlay */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage: topoPattern("#FFFBF1", 0.14),
            backgroundSize: "420px 420px",
            pointerEvents: "none",
          }}
        />

        {/* Sun glow */}
        <div
          style={{
            position: "absolute",
            right: "12%",
            top: "18%",
            width: 200,
            height: 200,
            borderRadius: "50%",
            background: "radial-gradient(circle, var(--accent-2) 0%, rgba(216,154,58,0.50) 30%, transparent 70%)",
            filter: "blur(10px)",
            pointerEvents: "none",
          }}
        />

        {/* Mountain layers */}
        <svg
          viewBox="0 0 600 800"
          preserveAspectRatio="xMidYMax slice"
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: "-5%",
            width: "110%",
            height: "100%",
            pointerEvents: "none",
          }}
        >
          <path
            d="M0 800 L0 540 L80 430 L160 500 L240 340 L320 440 L400 300 L480 420 L560 360 L600 390 L600 800 Z"
            fill="rgba(0,0,0,0.20)"
          />
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
        <div
          style={{
            position: "absolute",
            top: 28,
            left: 32,
            color: "#FFFBF1",
            zIndex: 2,
          }}
        >
          <Link
            href="/"
            style={{
              color: "#FFFBF1",
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ marginTop: -2 }}>
              <path d="M3 20L9 9l3 5 3-7 6 13H3z" />
              <circle cx="20" cy="4" r="3.5" fill="#FFFBF1" stroke="none" />
            </svg>
            <span style={{ fontWeight: 800, fontSize: 19, letterSpacing: -0.3 }}>
              Park<span style={{ fontWeight: 500 }}>Quest</span>
            </span>
          </Link>
        </div>

        {/* Title anchored to bottom */}
        <div style={{ position: "relative", zIndex: 2, padding: "0 32px 40px" }}>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10.5,
              letterSpacing: "2.6px",
              color: "rgba(255,251,241,0.65)",
              textTransform: "uppercase",
              fontWeight: 600,
              marginBottom: 10,
            }}
          >
            ACCOUNT
          </div>
          <h1
            style={{
              fontWeight: 800,
              fontSize: "clamp(36px, 6vw, 60px)",
              color: "#FFFBF1",
              letterSpacing: -1.4,
              lineHeight: 1.0,
              margin: 0,
            }}
          >
            Delete Your Account
          </h1>
        </div>
      </div>

      {/* ── Content ────────────────────────────────────────────────────────── */}
      <div
        style={{
          flex: 1,
          maxWidth: 780,
          width: "100%",
          margin: "0 auto",
          padding: "32px 32px 80px",
        }}
      >
        <DeleteAccountContent />
      </div>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <div
        style={{
          background: "var(--primary-deep)",
          borderTop: "0.5px solid rgba(255,251,241,0.10)",
          padding: "20px 32px",
          textAlign: "center",
        }}
      >
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: "rgba(255,251,241,0.40)", fontFamily: "var(--font-mono)", letterSpacing: "0.8px" }}>
            © PARKQUEST {new Date().getFullYear()}
          </span>
          <Link href="/privacy" style={{ fontSize: 12, color: "rgba(255,251,241,0.50)", textDecoration: "none", fontFamily: "var(--font-mono)", letterSpacing: "0.8px" }}>
            PRIVACY
          </Link>
          <Link href="/support" style={{ fontSize: 12, color: "rgba(255,251,241,0.50)", textDecoration: "none", fontFamily: "var(--font-mono)", letterSpacing: "0.8px" }}>
            CONTACT
          </Link>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 48 }}>
      <h2
        style={{
          fontWeight: 800,
          fontSize: 20,
          color: "var(--ink)",
          letterSpacing: -0.3,
          marginBottom: 14,
          marginTop: 0,
          paddingBottom: 10,
          borderBottom: "0.5px solid var(--hairline)",
        }}
      >
        {title}
      </h2>
      <div
        style={{
          fontSize: 15,
          color: "var(--ink-soft)",
          lineHeight: 1.75,
        }}
      >
        {children}
      </div>
    </section>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p style={{ margin: 0, marginBottom: 14 }}>{children}</p>;
}

function Ol({ items }: { items: string[] }) {
  return (
    <ol style={{ margin: "0 0 14px 0", paddingLeft: 22 }}>
      {items.map((item, i) => (
        <li key={i} style={{ marginBottom: 6 }}>{item}</li>
      ))}
    </ol>
  );
}

function Ul({ items }: { items: string[] }) {
  return (
    <ul style={{ margin: "0 0 14px 0", paddingLeft: 22 }}>
      {items.map((item, i) => (
        <li key={i} style={{ marginBottom: 6 }}>{item}</li>
      ))}
    </ul>
  );
}

function DeleteAccountContent() {
  return (
    <>
      <div
        style={{
          background: "var(--surface)",
          border: "0.5px solid var(--hairline)",
          borderRadius: 14,
          padding: "24px 28px",
          marginBottom: 48,
          fontSize: 15,
          color: "var(--ink-soft)",
          lineHeight: 1.7,
        }}
      >
        You can permanently delete your ParkQuest account and all associated data at any time, either from within the app or by contacting us directly.
      </div>

      <Section title="Delete from the app">
        <P>To delete your account and data from your device:</P>
        <Ol items={[
          "Open ParkQuest and go to the Profile tab.",
          "Tap the edit (pencil) icon to open Edit Profile.",
          "Scroll to the bottom and tap “Delete account.”",
          "Type DELETE to confirm.",
        ]} />
        <P>Your account is deleted immediately and cannot be undone.</P>
      </Section>

      <Section title="Delete specific data without deleting your account">
        <P>You don&rsquo;t have to delete your whole account to remove individual data:</P>
        <Ul items={[
          "Posts: open the post, tap the menu (•••), tap “Delete post,” confirm.",
          "Visits / journal entries: open the entry and delete it from there.",
          "Photos: remove them from a visit, journal entry, or post the same way — this deletes them from storage.",
          "Comments: tap the comment and choose delete.",
        ]} />
        <P>These deletions are immediate and permanent.</P>
      </Section>

      <Section title="No longer have the app?">
        <P>
          If you&rsquo;ve uninstalled ParkQuest and can&rsquo;t sign back in, request deletion through our{" "}
          <Link href="/support" style={{ color: "var(--primary)", fontWeight: 600, textDecoration: "none" }}>
            support page
          </Link>
          . Include the email address associated with your account so we can locate it.
        </P>
      </Section>

      <Section title="What gets deleted">
        <P>Deleting your account removes your personal data, visit records, journal entries, posts, badges, and uploaded photos.</P>
        <P>We delete your personal information within 30 days of the request, except where we&rsquo;re required to retain it for legal or operational reasons (such as resolving disputes or complying with applicable law) — see our{" "}
          <Link href="/privacy" style={{ color: "var(--primary)", fontWeight: 600, textDecoration: "none" }}>
            Privacy Policy
          </Link>
          {" "}for details.
        </P>
      </Section>
    </>
  );
}

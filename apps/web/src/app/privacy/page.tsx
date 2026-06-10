import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "Learn how ParkQuest collects, uses, and protects your personal information.",
};

function topoPattern(color: string, opacity: number): string {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='420' height='420' viewBox='0 0 420 420'><g fill='none' stroke='${color}' stroke-opacity='${opacity}' stroke-width='1'><path d='M-20 60 Q 60 30 130 60 T 280 60 T 440 60'/><path d='M-20 110 Q 60 80 130 110 T 280 110 T 440 110'/><path d='M-20 160 Q 60 130 130 160 T 280 160 T 440 160'/><path d='M-20 210 Q 60 180 130 210 T 280 210 T 440 210'/><path d='M-20 260 Q 60 230 130 260 T 280 260 T 440 260'/><path d='M-20 310 Q 60 280 130 310 T 280 310 T 440 310'/><path d='M-20 360 Q 60 330 130 360 T 280 360 T 440 360'/><path d='M-20 410 Q 60 380 130 410 T 280 410 T 440 410'/></g></svg>`;
  return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
}

export default function PrivacyPage() {
  const EFFECTIVE_DATE = "June 9, 2026";

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
            LEGAL
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
            Privacy Policy
          </h1>
          <div
            style={{
              fontSize: 14,
              color: "rgba(255,251,241,0.70)",
              marginTop: 10,
              fontFamily: "var(--font-mono)",
              letterSpacing: "0.4px",
              fontWeight: 500,
            }}
          >
            Effective {EFFECTIVE_DATE}
          </div>
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
      <PolicyContent />
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
          <Link href="/terms" style={{ fontSize: 12, color: "rgba(255,251,241,0.50)", textDecoration: "none", fontFamily: "var(--font-mono)", letterSpacing: "0.8px" }}>
            TERMS
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

function Ul({ items }: { items: string[] }) {
  return (
    <ul style={{ margin: "0 0 14px 0", paddingLeft: 22 }}>
      {items.map((item, i) => (
        <li key={i} style={{ marginBottom: 6 }}>{item}</li>
      ))}
    </ul>
  );
}

function PolicyContent() {
  return (
    <>
      {/* Lead */}
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
        ParkQuest (&ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;) is a personal project built to help you track visits to all 63 U.S. national parks, earn badges, keep a trip journal, and connect with fellow explorers. This Privacy Policy explains what information we collect when you use ParkQuest, how we use it, and the choices you have. By using ParkQuest you agree to these practices.
      </div>

      <Section title="1. Information We Collect">
        <P><strong>Account information.</strong> When you create an account, we collect your email address, a username you choose, and optionally your first and last name. If you sign in with Apple or Google, we receive the profile information those providers share with us (typically your name and email address).</P>
        <P><strong>Park visit and journal data.</strong> We store the records you create: which parks you&apos;ve marked as visited or bucket-listed, visit dates, journal entries, notes, companions you tag, and any photos you upload.</P>
        <P><strong>Profile and social content.</strong> We store your profile photo, bio, follower/following relationships, posts you publish to the feed, reactions, and comments.</P>
        <P><strong>Trip plans.</strong> Itineraries, dates, and parks you add to the planner are stored in your account.</P>
        <P><strong>Support communications.</strong> If you contact us through the support form we collect your name, email address, and the message you send.</P>
        <P><strong>Usage data.</strong> We collect anonymized analytics about how pages are visited — page views and general interaction events — to understand how the app is being used and to improve it. This data does not include personally identifiable information.</P>
      </Section>

      <Section title="2. How We Use Your Information">
        <Ul items={[
          "To operate the app and provide all features: visit tracking, badges, journaling, the map, the planner, and the social feed.",
          "To authenticate you and keep your account secure.",
          "To send transactional emails (email verification, password reset codes, device verification).",
          "To calculate and award badges and achievements based on your visit history.",
          "To show your content to followers when you choose to share it publicly.",
          "To respond to support requests you submit.",
          "To understand aggregate usage patterns and improve the product.",
        ]} />
        <P>We do not use your information for advertising, and we do not sell your data to third parties.</P>
      </Section>

      <Section title="3. Third-Party Services">
        <P>ParkQuest relies on the following third-party services to operate. Each has its own privacy practices.</P>
        <Ul items={[
          "Clerk — authentication and user management. Handles sign-in, sign-up, OAuth flows, session management, and email verification. clerk.com/privacy",
          "Apple Sign In / Google Sign In — OAuth identity providers. Used only if you choose to sign in with Apple or Google.",
          "Vercel — hosting and edge infrastructure. Also provides the anonymous analytics we use. vercel.com/legal/privacy-policy",
          "Cloudflare R2 — object storage used to host photos and files you upload.",
          "Formspree — processes support form submissions and forwards them to us. formspree.io/legal/privacy-policy",
        ]} />
        <P>We only share with these services the minimum data needed for them to perform their function.</P>
      </Section>

      <Section title="4. Data Sharing">
        <P><strong>With other users.</strong> Content you share publicly (posts, your visit count visible on your profile, your follower/following lists) is visible to other ParkQuest users. Journal entries and visit details are private by default unless you explicitly publish them to the feed.</P>
        <P><strong>With service providers.</strong> As described above, we share data with third-party services that help operate the app. These providers are contractually restricted from using your data for any purpose other than providing services to us.</P>
        <P><strong>Legal requirements.</strong> We may disclose your information if required by law or in response to valid legal process.</P>
        <P>We do not sell, rent, or trade your personal information to any third party.</P>
      </Section>

      <Section title="5. Photos and Uploaded Files">
        <P>Photos you upload (profile pictures, journal photos) are stored on Cloudflare R2 object storage. Journal photos are associated with your account and only accessible to users you grant access to (or publicly, if you publish a post). You can delete uploaded photos at any time through the app, which removes them from storage.</P>
      </Section>

      <Section title="6. Data Retention">
        <P>We retain your account data for as long as your account is active. If you delete your account, we will delete your personal information within 30 days, except where we are required to retain it for legal or operational reasons (such as resolving disputes or complying with applicable law).</P>
        <P>Anonymous analytics data (page views, aggregate events) has no retention limit as it contains no personal information.</P>
      </Section>

      <Section title="7. Security">
        <P>We use industry-standard practices to protect your information: HTTPS for all data in transit, and access controls on our data stores. Authentication is handled by Clerk, which provides secure session management, hashed passwords, and multi-factor authentication support.</P>
        <P>No system is perfectly secure. If you believe your account has been compromised, please contact us immediately through the support page.</P>
      </Section>

      <Section title="8. Your Rights and Choices">
        <P><strong>Access and correction.</strong> You can view and update your profile information (username, name, profile photo) at any time in your account settings.</P>
        <P><strong>Deletion.</strong> You can delete your account from the account settings. This removes your personal data, visit records, journal entries, posts, and uploaded photos.</P>
        <P><strong>Data export.</strong> If you want a copy of your data, contact us through the support page and we will provide it within a reasonable time.</P>
        <P><strong>Email communications.</strong> Transactional emails (verification codes, password resets) are necessary for the service to function and cannot be opted out of while you hold an account.</P>
      </Section>

      <Section title="9. Children's Privacy">
        <P>ParkQuest is not directed to children under 13. We do not knowingly collect personal information from children under 13. If you believe a child under 13 has provided us with personal information, please contact us and we will delete it promptly.</P>
      </Section>

      <Section title="10. Changes to This Policy">
        <P>We may update this Privacy Policy from time to time. When we do, we will revise the effective date at the top. If changes are material, we will provide notice within the app. Continued use of ParkQuest after changes take effect constitutes acceptance of the updated policy.</P>
      </Section>

      <Section title="11. Contact">
        <P>
          Questions or concerns about this policy? Reach us through the{" "}
          <Link href="/support" style={{ color: "var(--primary)", fontWeight: 600, textDecoration: "none" }}>
            support page
          </Link>
          . We will respond within a few business days.
        </P>
      </Section>
    </>
  );
}

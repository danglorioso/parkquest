import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "Read the Terms of Service for ParkQuest — the rules and guidelines for using the app.",
};

function topoPattern(color: string, opacity: number): string {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='420' height='420' viewBox='0 0 420 420'><g fill='none' stroke='${color}' stroke-opacity='${opacity}' stroke-width='1'><path d='M-20 60 Q 60 30 130 60 T 280 60 T 440 60'/><path d='M-20 110 Q 60 80 130 110 T 280 110 T 440 110'/><path d='M-20 160 Q 60 130 130 160 T 280 160 T 440 160'/><path d='M-20 210 Q 60 180 130 210 T 280 210 T 440 210'/><path d='M-20 260 Q 60 230 130 260 T 280 260 T 440 260'/><path d='M-20 310 Q 60 280 130 310 T 280 310 T 440 310'/><path d='M-20 360 Q 60 330 130 360 T 280 360 T 440 360'/><path d='M-20 410 Q 60 380 130 410 T 280 410 T 440 410'/></g></svg>`;
  return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
}

export default function TermsPage() {
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
            Terms of Service
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
        <TermsContent />
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

function Ul({ items }: { items: string[] }) {
  return (
    <ul style={{ margin: "0 0 14px 0", paddingLeft: 22 }}>
      {items.map((item, i) => (
        <li key={i} style={{ marginBottom: 6 }}>{item}</li>
      ))}
    </ul>
  );
}

function TermsContent() {
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
        These Terms of Service (&ldquo;Terms&rdquo;) govern your access to and use of ParkQuest, including its website, web application, and any related services (collectively, the &ldquo;Service&rdquo;). By creating an account or using the Service, you agree to these Terms. If you do not agree, do not use ParkQuest.
      </div>

      <Section title="1. Eligibility">
        <P>You must be at least 13 years old to use ParkQuest. By using the Service you represent that you meet this requirement. If you are under 18, you represent that your parent or guardian has reviewed and agreed to these Terms on your behalf.</P>
        <P>ParkQuest is currently available only to users in the United States. Access from other jurisdictions is not supported and may not function correctly.</P>
      </Section>

      <Section title="2. Your Account">
        <P>You are responsible for maintaining the confidentiality of your account credentials and for all activity that occurs under your account. Choose a strong password and do not share your login with others.</P>
        <P>You agree to provide accurate information when creating your account and to keep it up to date. Usernames must be appropriate and may not impersonate another person, contain offensive language, or mislead other users.</P>
        <P>We reserve the right to suspend or terminate accounts that violate these Terms, at our sole discretion and without prior notice when necessary to protect the Service or other users.</P>
      </Section>

      <Section title="3. Acceptable Use">
        <P>You agree to use ParkQuest only for its intended purpose — tracking national park visits, journaling, planning trips, earning badges, and connecting with other explorers.</P>
        <P>You must not:</P>
        <Ul items={[
          "Post content that is unlawful, abusive, threatening, harassing, defamatory, obscene, or otherwise objectionable.",
          "Upload files or content that infringe any third party's intellectual property rights.",
          "Use the Service to send spam, unsolicited messages, or commercial solicitations to other users.",
          "Attempt to gain unauthorized access to any part of the Service or another user's account.",
          "Scrape, crawl, or otherwise extract data from the Service in bulk without written permission.",
          "Use the Service in any way that could damage, disable, overburden, or impair its infrastructure.",
          "Reverse-engineer, decompile, or attempt to extract the source code of the Service.",
          "Use automated tools, bots, or scripts to interact with the Service in ways that could harm other users or the platform.",
        ]} />
      </Section>

      <Section title="4. User Content">
        <P><strong>Your content.</strong> You retain ownership of the content you submit to ParkQuest — journal entries, photos, posts, and other material you create (&ldquo;User Content&rdquo;).</P>
        <P><strong>License to us.</strong> By submitting User Content, you grant ParkQuest a non-exclusive, worldwide, royalty-free license to store, display, and distribute that content as necessary to operate the Service. For content you share publicly (feed posts, public profile data), this license also covers making it visible to other users.</P>
        <P><strong>Your responsibility.</strong> You are solely responsible for the User Content you submit. You represent that you have all necessary rights to share it and that it does not violate any law or third-party rights.</P>
        <P><strong>Removal.</strong> We may remove User Content that violates these Terms or that we determine, in our sole discretion, is harmful to the Service or its users.</P>
      </Section>

      <Section title="5. Privacy">
        <P>
          Our{" "}
          <Link href="/privacy" style={{ color: "var(--primary)", fontWeight: 600, textDecoration: "none" }}>
            Privacy Policy
          </Link>
          {" "}describes how we collect, use, and protect your information. By using ParkQuest you agree to our data practices as described there.
        </P>
      </Section>

      <Section title="6. Intellectual Property">
        <P>ParkQuest and its original content — including the name, logo, design, code, and all features not constituting User Content — are the exclusive property of Dan Glorioso. Nothing in these Terms grants you a right to use the ParkQuest name, logo, or any other brand elements.</P>
        <P>The U.S. National Park names, logos, and imagery are the property of the National Park Service and the U.S. government. ParkQuest is an independent project and is not affiliated with, endorsed by, or sponsored by the National Park Service.</P>
      </Section>

      <Section title="7. Third-Party Services">
        <P>ParkQuest integrates third-party services including Clerk (authentication), Apple and Google (sign-in), Vercel (hosting), and Cloudflare (file storage). Your use of those services is subject to their respective terms and privacy policies. We are not responsible for the practices of any third-party service.</P>
      </Section>

      <Section title="8. Disclaimers">
        <P>ParkQuest is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo; without warranties of any kind, express or implied. We do not warrant that the Service will be uninterrupted, error-free, or free of harmful components. We do not guarantee the accuracy of any park information, weather data, or other third-party data displayed in the app.</P>
        <P>Park visit planning, trail conditions, and travel safety are entirely your responsibility. Always consult official National Park Service resources and follow posted regulations before visiting a park.</P>
      </Section>

      <Section title="9. Limitation of Liability">
        <P>To the fullest extent permitted by applicable law, ParkQuest and its creator shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising from your use of or inability to use the Service — including loss of data, loss of profits, or any other intangible losses — even if we have been advised of the possibility of such damages.</P>
        <P>Our total liability to you for any claims arising from these Terms or the Service shall not exceed the greater of $10 USD or the amount you have paid to us in the past twelve months (which is currently $0 as the Service is free).</P>
      </Section>

      <Section title="10. Indemnification">
        <P>You agree to indemnify and hold harmless ParkQuest and its creator from any claims, losses, damages, liabilities, and expenses (including reasonable legal fees) arising from your use of the Service, your User Content, or your violation of these Terms.</P>
      </Section>

      <Section title="11. Termination">
        <P>You may stop using ParkQuest and delete your account at any time through the account settings.</P>
        <P>We may suspend or terminate your access to the Service at any time, with or without cause, and with or without notice. Upon termination, your right to use the Service ceases immediately. Provisions of these Terms that by their nature should survive termination will do so, including Sections 4, 6, 8, 9, and 10.</P>
      </Section>

      <Section title="12. Changes to These Terms">
        <P>We may update these Terms from time to time. When we do, we will update the effective date at the top of this page. If changes are material, we will provide notice within the app. Continued use of ParkQuest after updated Terms take effect constitutes your acceptance of the new Terms.</P>
      </Section>

      <Section title="13. Governing Law">
        <P>These Terms are governed by the laws of the State of New York, without regard to its conflict-of-law principles. Any disputes arising from these Terms or the Service shall be resolved in the courts located in New York.</P>
      </Section>

      <Section title="14. Contact">
        <P>
          Questions about these Terms? Reach us through the{" "}
          <Link href="/support" style={{ color: "var(--primary)", fontWeight: 600, textDecoration: "none" }}>
            support page
          </Link>
          .
        </P>
      </Section>
    </>
  );
}

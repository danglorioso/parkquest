"use client";

import Link from "next/link";
import { useUser } from "@clerk/nextjs";
import { Instagram } from "lucide-react";
import Logo from "@/components/Logo";
import { AppStoreBadge, APP_STORE_URL } from "@/components/AppStoreBadge";
import { publicHref } from "@/components/public/PublicNav";

// Shared footer for the signed-out pages. Every link here resolves for a
// logged-out visitor: park pages and /parks filters are public, and the
// app-only sections go through publicHref so they survive sign-in.

/**
 * bottomClearance for the pages that still pin their sign-up banner with
 * position:fixed over an inner scroll column (/parks, /parks/[code]) — tall
 * enough to clear it when its copy wraps to two lines.
 */
export const FIXED_BANNER_CLEARANCE = 96;

interface FooterLink {
  label: string;
  href: string;
  gated?: boolean;
  external?: boolean;
}

// `activity` values are the NPS activity names /parks filters on, verbatim.
const COLUMNS: { title: string; links: FooterLink[] }[] = [
  {
    title: "Explore",
    links: [
      { label: "All parks", href: "/parks" },
      { label: "Park map", href: "/map", gated: true },
      { label: "Passport", href: "/passport", gated: true },
      { label: "Badges", href: "/badges", gated: true },
      { label: "Friends feed", href: "/feed", gated: true },
    ],
  },
  {
    title: "Popular parks",
    links: [
      { label: "Yellowstone", href: "/parks/yell" },
      { label: "Yosemite", href: "/parks/yose" },
      { label: "Grand Canyon", href: "/parks/grca" },
      { label: "Zion", href: "/parks/zion" },
      { label: "Great Smoky Mountains", href: "/parks/grsm" },
      { label: "Glacier", href: "/parks/glac" },
      { label: "Acadia", href: "/parks/acad" },
    ],
  },
  {
    title: "Things to do",
    links: [
      { label: "Hiking", href: "/parks?activity=Hiking" },
      { label: "Camping", href: "/parks?activity=Camping" },
      { label: "Stargazing", href: "/parks?activity=Stargazing" },
      { label: "Wildlife watching", href: "/parks?activity=Wildlife%20Watching" },
      { label: "Paddling", href: "/parks?activity=Paddling" },
      { label: "Fishing", href: "/parks?activity=Fishing" },
    ],
  },
  {
    title: "ParkQuest",
    links: [
      { label: "Home", href: "/" },
      { label: "Get the iPhone app", href: APP_STORE_URL, external: true },
      { label: "Support", href: "/support" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Terms", href: "/terms" },
      { label: "Privacy", href: "/privacy" },
    ],
  },
];

export function PublicFooter({ bottomClearance = 0 }: {
  /** Extra bottom padding for pages that pin a fixed banner over the viewport's bottom edge. */
  bottomClearance?: number;
}) {
  const { isSignedIn } = useUser();

  return (
    <footer className="pq-footer" style={{ containerType: "inline-size", background: "var(--surface)", borderTop: "0.5px solid var(--hairline)" }}>
      <style>{`
        .pq-footer-grid { display: grid; grid-template-columns: minmax(220px, 1.5fr) repeat(5, auto); gap: 40px 44px; }
        .pq-footer-link { color: var(--ink-soft); text-decoration: none; font-size: 13.5px; }
        .pq-footer-link:hover { color: var(--ink); text-decoration: underline; text-underline-offset: 3px; }
        @container (max-width: 980px) {
          .pq-footer-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
          .pq-footer-brand { grid-column: 1 / -1; }
        }
        @container (max-width: 520px) {
          .pq-footer-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        }
      `}</style>

      <div style={{ maxWidth: 1120, margin: "0 auto", padding: `48px 28px ${28 + bottomClearance}px` }}>
        <div className="pq-footer-grid">
          <div className="pq-footer-brand">
            <Logo />
            <p style={{ fontSize: 13.5, color: "var(--ink-soft)", lineHeight: 1.55, margin: "12px 0 18px", maxWidth: 280 }}>
              A passport for America&rsquo;s national parks. Log your visits, collect a stamp for each park, and earn badges along the way.
            </p>
            <a
              href="https://instagram.com/parkquest.me"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="ParkQuest on Instagram"
              style={{
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                width: 36, height: 36, borderRadius: "50%", marginBottom: 14,
                background: "var(--surface-alt)", border: "0.5px solid var(--hairline)",
                color: "var(--ink-soft)",
              }}
            >
              <Instagram size={17} strokeWidth={2} />
            </a>
            <AppStoreBadge />
          </div>

          {COLUMNS.map((col) => (
            <nav key={col.title} aria-label={col.title}>
              <div style={{
                fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "1.4px", fontWeight: 600,
                color: "var(--ink-mute)", textTransform: "uppercase", marginBottom: 14,
              }}>
                {col.title}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {col.links.map((link) =>
                  link.external ? (
                    <a key={link.label} href={link.href} target="_blank" rel="noopener noreferrer" className="pq-footer-link">
                      {link.label}
                    </a>
                  ) : (
                    <Link key={link.label} href={publicHref(link, isSignedIn)} className="pq-footer-link">
                      {link.label}
                    </Link>
                  )
                )}
              </div>
            </nav>
          ))}
        </div>

        <div style={{ borderTop: "0.5px solid var(--hairline)", marginTop: 40, paddingTop: 22 }}>
          <p style={{ fontSize: 12.5, color: "var(--ink-mute)", lineHeight: 1.6, margin: 0, maxWidth: 720 }}>
            Park information and photos come from the{" "}
            <a href="https://www.nps.gov" target="_blank" rel="noopener noreferrer" style={{ textDecoration: "underline" }}>
              National Park Service
            </a>
            . ParkQuest is an independent project and is not affiliated with or endorsed by the National Park Service.
          </p>
          <p style={{ fontSize: 12.5, color: "var(--ink-mute)", margin: "14px 0 0" }}>
            © {new Date().getFullYear()} ParkQuest. Created by{" "}
            <a href="https://danglorioso.com" target="_blank" rel="noopener noreferrer" style={{ color: "var(--ink-soft)", fontWeight: 600, textDecoration: "none" }}>
              Dan Glorioso
            </a>
            .
          </p>
        </div>
      </div>
    </footer>
  );
}

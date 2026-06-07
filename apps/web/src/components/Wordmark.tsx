export function Wordmark({ size = "default" }: { size?: "default" | "large" } = {}) {
  const isLarge = size === "large";
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: isLarge ? 7 : 6, color: "var(--primary)" }}>
      <svg
        width={isLarge ? 26 : 22}
        height={isLarge ? 26 : 22}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ marginTop: isLarge ? -1 : -2, flexShrink: 0 }}
      >
        <path d="M3 20L9 9l3 5 3-7 6 13H3z" />
        <circle cx="20" cy="4" r="3.5" fill="var(--accent-2)" stroke="none" />
      </svg>
      <span style={{ fontWeight: 800, fontSize: isLarge ? 20 : 18, letterSpacing: -0.4, lineHeight: 1, color: "var(--primary)" }}>
        Park<span style={{ fontWeight: 500 }}>Quest</span>
      </span>
    </div>
  );
}

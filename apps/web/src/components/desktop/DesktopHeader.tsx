// Reusable section header used across all desktop screens.
// kicker = mono uppercase label above the title.

interface DesktopHeaderProps {
  kicker?: string;
  title: string;
  sub?: string;
  actions?: React.ReactNode;
}

export function DesktopHeader({ kicker, title, sub, actions }: DesktopHeaderProps) {
  return (
    <div
      className="flex items-end justify-between"
      style={{
        padding: "24px 32px 18px",
        borderBottom: "0.5px solid var(--hairline-soft)",
      }}
    >
      <div>
        {kicker && (
          <div
            className="uppercase font-semibold"
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              letterSpacing: "1.6px",
              color: "var(--ink-mute)",
              marginBottom: 5,
            }}
          >
            {kicker}
          </div>
        )}
        <div
          className="font-extrabold"
          style={{
            fontSize: 30,
            lineHeight: 1.05,
            letterSpacing: -0.6,
            color: "var(--ink)",
          }}
        >
          {title}
        </div>
        {sub && (
          <div style={{ fontSize: 14, color: "var(--ink-mute)", marginTop: 6 }}>
            {sub}
          </div>
        )}
      </div>
      {actions && (
        <div className="flex items-center gap-2 shrink-0">{actions}</div>
      )}
    </div>
  );
}

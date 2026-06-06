// Reusable button primitive for desktop screens.
// primary: forest green fill  ghost: no bg/border  default: surface pill

import { type ReactNode } from "react";

interface DesktopButtonProps {
  primary?: boolean;
  ghost?: boolean;
  size?: "sm" | "md";
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit" | "reset";
  style?: React.CSSProperties;
}

export function DesktopButton({
  primary,
  ghost,
  size = "md",
  children,
  onClick,
  disabled,
  type = "button",
  style: styleOverride,
}: DesktopButtonProps) {
  const pad = size === "sm" ? "6px 12px" : "8px 14px";
  const fs = size === "sm" ? 12 : 13;

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-1.5 font-bold cursor-pointer transition-opacity hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed"
      style={{
        background: primary
          ? "var(--primary)"
          : ghost
          ? "transparent"
          : "var(--surface)",
        color: primary ? "#FFFBF1" : "var(--ink)",
        border: ghost
          ? "none"
          : primary
          ? "none"
          : "0.5px solid var(--hairline)",
        borderRadius: 9,
        padding: pad,
        fontSize: fs,
        letterSpacing: 0.1,
        ...styleOverride,
      }}
    >
      {children}
    </button>
  );
}

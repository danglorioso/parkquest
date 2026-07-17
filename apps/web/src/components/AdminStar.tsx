import { Star } from "lucide-react";

// Verified-style badge shown beside admins' names — filled star in a
// primary-colored circle. Data comes from user_profiles.is_admin (display
// mirror of the Clerk role, synced by requireAdmin).
export function AdminStar({ size = 14 }: { size?: number }) {
  return (
    <span
      title="ParkQuest team"
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        height: size,
        borderRadius: "50%",
        background: "var(--primary)",
        flexShrink: 0,
        verticalAlign: "middle",
      }}
    >
      <Star size={size * 0.6} strokeWidth={0} fill="var(--primary-foreground)" />
    </span>
  );
}

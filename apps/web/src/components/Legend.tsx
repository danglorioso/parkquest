export default function Legend() {
  const items = [
    { color: "var(--visited)",   label: "Visited" },
    { color: "var(--bucket)",    label: "Bucket list" },
    { color: "var(--unvisited)", label: "Not yet" },
  ];
  return (
    <div
      className="flex items-center gap-3 px-3 py-2 rounded-lg"
      style={{
        background: "var(--surface)",
        border: "0.5px solid var(--hairline)",
        boxShadow: "var(--shadow-card)",
      }}
    >
      {items.map(({ color, label }) => (
        <div key={label} className="flex items-center gap-1.5">
          <div
            className="w-2.5 h-2.5 rounded-full shrink-0"
            style={{ background: color }}
          />
          <span
            className="text-[11px] font-semibold uppercase"
            style={{
              fontFamily: "var(--font-mono)",
              letterSpacing: "0.8px",
              color: "var(--ink-mute)",
            }}
          >
            {label}
          </span>
        </div>
      ))}
    </div>
  );
}
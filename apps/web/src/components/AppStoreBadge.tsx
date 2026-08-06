const APP_STORE_URL = "https://apps.apple.com/us/app/parkquest-national-park-log/id6778208311";

export function AppStoreBadge({ className }: { className?: string }) {
  return (
    <a
      href={APP_STORE_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-block ${className ?? ""}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/app-store-badge.svg" alt="Download on the App Store" width={135} height={40} />
    </a>
  );
}

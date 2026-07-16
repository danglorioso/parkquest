import { Apple } from "lucide-react";

const APP_STORE_URL = "https://apps.apple.com/us/app/parkquest-national-park-log/id6778208311";

export function AppStoreBadge({ className }: { className?: string }) {
  return (
    <a
      href={APP_STORE_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-2 rounded-xl bg-black text-white px-4 py-2.5 hover:bg-black/80 transition-colors duration-200 ${className ?? ""}`}
    >
      <Apple size={22} fill="currentColor" />
      <span className="flex flex-col leading-tight">
        <span className="text-[10px] opacity-80">Download on the</span>
        <span className="text-sm font-semibold -mt-0.5">App Store</span>
      </span>
    </a>
  );
}

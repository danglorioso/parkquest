import { AppStoreBadge } from "./AppStoreBadge";

export default function Footer() {
  return (
    <footer className="bg-green-900 border-t border-white/10 mt-auto">
      <div className="max-w-6xl mx-auto px-6 py-4">
        <div className="flex flex-col items-center space-y-3">
          <AppStoreBadge />
          <div className="text-center">
            <p className="text-white text-sm md:text-base mb-1">
              Created by{" "}
              <a
                href="https://danglorioso.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-white hover:text-yellow-200 font-medium transition-colors duration-300 underline decoration-white/60 hover:decoration-yellow-200 underline-offset-2"
              >
                Dan Glorioso
              </a>
              .
            </p>
            <p className="text-white/80 text-xs">
              © {new Date().getFullYear()} All rights reserved
            </p>
          </div>
          <div className="flex items-center gap-5">
            <a href="/privacy" className="text-white/50 hover:text-white/80 text-xs font-mono tracking-wider transition-colors duration-200">
              PRIVACY
            </a>
            <a href="/terms" className="text-white/50 hover:text-white/80 text-xs font-mono tracking-wider transition-colors duration-200">
              TERMS
            </a>
            <a href="/support" className="text-white/50 hover:text-white/80 text-xs font-mono tracking-wider transition-colors duration-200">
              CONTACT
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}

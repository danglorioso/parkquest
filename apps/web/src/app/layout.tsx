import type { Metadata } from "next";
import { Archivo, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Analytics } from "@vercel/analytics/next";
import { ClerkProvider } from "@clerk/nextjs";
import OnboardingGuard from "../components/OnboardingGuard";
import { ThemeProvider } from "../components/ThemeProvider";
import { ToastProvider } from "../components/ToastProvider";
import 'leaflet/dist/leaflet.css';

const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: {
    template: "%s | ParkQuest",
    default: "ParkQuest - Track Your National Park Adventures",
  },
  description: "Track your visits, earn badges, and explore the beauty of national parks across the country with ParkQuest.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html lang="en">
        {/* Restore dark mode + palette before first paint to prevent flash */}
        <head>
          <script dangerouslySetInnerHTML={{ __html: `(function(){try{if(localStorage.getItem('pq-dark')==='1')document.documentElement.classList.add('dark');var p=localStorage.getItem('pq-palette')||'forest';var pv={canyon:{'--primary':'#7B3A1F','--primary-deep':'#582410','--accent':'#D89A3A','--accent-2':'#C56B3D'},glacier:{'--primary':'#2D4F66','--primary-deep':'#1A3548','--accent':'#C7864B','--accent-2':'#D89A3A'},dusk:{'--primary':'#3A2E5C','--primary-deep':'#241B40','--accent':'#D9764A','--accent-2':'#D89A3A'}};if(pv[p])Object.entries(pv[p]).forEach(function(e){document.documentElement.style.setProperty(e[0],e[1])});}catch(e){}})();` }} />
        </head>
        <body
          className={`${archivo.variable} ${jetbrainsMono.variable} antialiased`}
        >
          <ThemeProvider>
            <ToastProvider>
              <OnboardingGuard />
              {children}
            </ToastProvider>
          </ThemeProvider>

          {/* Vercel Analytics */}
          <Analytics />

        </body>
      </html>
    </ClerkProvider>
  );
}

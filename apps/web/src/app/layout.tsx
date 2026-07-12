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
          <script dangerouslySetInnerHTML={{ __html: `(function(){try{var d=localStorage.getItem('pq-dark')==='1';if(d)document.documentElement.classList.add('dark');var p=localStorage.getItem('pq-palette')||'forest';var pv={forest:{light:null,dark:{'--primary':'#4E8264','--primary-deep':'#2C5240','--accent':'#D8814F','--accent-2':'#E0B454'}},canyon:{light:{'--primary':'#7B3A1F','--primary-deep':'#582410','--accent':'#D89A3A','--accent-2':'#C56B3D'},dark:{'--primary':'#B25F38','--primary-deep':'#7B3A1F','--accent':'#E2AB52','--accent-2':'#D8814F'}},glacier:{light:{'--primary':'#2D4F66','--primary-deep':'#1A3548','--accent':'#C7864B','--accent-2':'#D89A3A'},dark:{'--primary':'#5C87A3','--primary-deep':'#38607C','--accent':'#D69A60','--accent-2':'#E0B454'}},dusk:{light:{'--primary':'#3A2E5C','--primary-deep':'#241B40','--accent':'#D9764A','--accent-2':'#D89A3A'},dark:{'--primary':'#7A6BAB','--primary-deep':'#4E4180','--accent':'#E28A5F','--accent-2':'#E0B454'}}};var v=pv[p]&&pv[p][d?'dark':'light'];if(v)Object.entries(v).forEach(function(e){document.documentElement.style.setProperty(e[0],e[1])});}catch(e){}})();` }} />
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

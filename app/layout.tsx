import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import "./editorial.css";
import "./experience.css";
import "./atmosphere.css";
import "./media-app.css";
import "./library.css";
const jakarta = localFont({src:"./fonts/PlusJakartaSans-Variable.ttf", variable:"--font-jakarta", weight:"200 800",display:"swap",preload:true});
export const metadata: Metadata = {
  title: "half full",
  description: "Your daily news, in perspective.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "half full" },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#F9F7F2",
  viewportFit: "cover",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={jakarta.variable}>
      <body>
        <a className="skip-link" href="#main">
          Skip to edition
        </a>
        {children}
      </body>
    </html>
  );
}

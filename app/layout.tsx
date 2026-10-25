import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./editorial.css";
export const metadata: Metadata = {
  title: "half full",
  description: "Your daily news, in perspective.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "half full" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#faf9f4",
  viewportFit: "cover",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main">
          Skip to edition
        </a>
        {children}
      </body>
    </html>
  );
}

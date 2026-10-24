import type { Metadata, Viewport } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "US — a finite news edition", description: "Current news, cautious evidence review, and a place to stop.",
  manifest: "/manifest.webmanifest", appleWebApp: { capable: true, statusBarStyle: "default", title: "US" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#183f35" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><a className="skip-link" href="#main">Skip to edition</a>{children}</body></html>;
}

import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "US — a finite news edition",
  description: "Current news, cautious evidence review, and a place to stop.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}

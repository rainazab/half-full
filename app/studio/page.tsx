import Studio from "@/components/Studio";
import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "Editorial studio · half full",
  robots: { index: false, follow: false },
};
export default function StudioPage() {
  return <Studio />;
}

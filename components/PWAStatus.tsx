"use client";
import { useEffect } from "react";

/** Register offline support without adding installation prompts to the reader. */
export default function PWAStatus() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV === "production" && window.isSecureContext) {
      void navigator.serviceWorker
        .register("/sw.js")
        .then((registration) => registration.update())
        .catch(() => {});
    } else if (process.env.NODE_ENV !== "production") {
      void navigator.serviceWorker
        .getRegistration()
        .then((registration) => {
          if (
            registration?.active?.scriptURL ===
            new URL("/sw.js", location.origin).href
          )
            return registration.unregister();
        })
        .catch(() => {});
    }
  }, []);
  return null;
}

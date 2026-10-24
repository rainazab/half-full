"use client";
import { useEffect, useState } from "react";
interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: string }>;
}
export default function PWAStatus() {
  const [updated, setUpdated] = useState(false);
  const [install, setInstall] = useState<InstallPrompt | null>(null);
  const [message, setMessage] = useState(
    "Install from your browser menu where supported. On iPhone, use Safari’s Share → Add to Home Screen.",
  );
  useEffect(() => {
    const controllerChanged = () => setUpdated(true);
    navigator.serviceWorker?.addEventListener(
      "controllerchange",
      controllerChanged,
    );
    const capture = (event: Event) => {
      event.preventDefault();
      setInstall(event as InstallPrompt);
    };
    const installed = () => {
      setInstall(null);
      setMessage("half full is installed.");
    };
    window.addEventListener("beforeinstallprompt", capture);
    window.addEventListener("appinstalled", installed);
    if (
      process.env.NODE_ENV === "production" &&
      "serviceWorker" in navigator &&
      window.isSecureContext
    ) {
      void navigator.serviceWorker
        .register("/sw.js")
        .then((registration) => registration.update())
        .catch(() =>
          setMessage(
            "Offline setup was unavailable. You can keep using half full while connected.",
          ),
        );
    }
    if (process.env.NODE_ENV !== "production" && "serviceWorker" in navigator) {
      void navigator.serviceWorker
        .getRegistration()
        .then((registration) => {
          if (
            registration?.active?.scriptURL ===
            new URL("/sw.js", window.location.origin).href
          )
            return registration.unregister();
        })
        .catch(() => undefined);
    }
    return () => {
      navigator.serviceWorker?.removeEventListener(
        "controllerchange",
        controllerChanged,
      );
      window.removeEventListener("beforeinstallprompt", capture);
      window.removeEventListener("appinstalled", installed);
    };
  }, []);
  return (
    <>
      {updated && (
        <p role="status">
          The offline archive is ready or updated.{" "}
          <button onClick={() => window.location.reload()}>
            Reload saved experience
          </button>
        </p>
      )}
      <p className="note">{message}</p>
      {install && (
        <button
          onClick={async () => {
            try {
              await install.prompt();
              await install.userChoice;
            } catch {
              setMessage("Use the browser menu to install half full.");
            } finally {
              setInstall(null);
            }
          }}
        >
          Install half full
        </button>
      )}
    </>
  );
}

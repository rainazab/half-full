"use client";
import { useEffect, useRef, useState } from "react";
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import {
  doc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";
import { firebaseClient, persistentAuth } from "@/lib/firebase-client";
import {
  applyProgress,
  authMessage,
  cleanProgress,
  emptyProgress,
  hasProgress,
  importGuest,
  pendingCacheKey,
  profileCacheKey,
  progressPatch,
} from "@/lib/profile-progress";
import type { ReadingProgress } from "@/lib/daily";
function read(key: string) {
  try {
    return cleanProgress(JSON.parse(localStorage.getItem(key) ?? "null"));
  } catch {
    return emptyProgress();
  }
}
function write(key: string, value: ReadingProgress) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}
export default function useProfile() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false),
    [signingIn, setSigningIn] = useState(false);
  const [progress, setProgress] = useState<ReadingProgress>(emptyProgress);
  const [sync, setSync] = useState<"local" | "syncing" | "saved" | "error">(
    "local",
  );
  const [error, setError] = useState("");
  const current = useRef<User | null>(null),
    version = useRef(0),
    progressRef = useRef(progress);
  const pending = useRef(emptyProgress()),
    revision = useRef(0);
  const flush = useRef<() => void>(() => {});
  function display(value: ReadingProgress, uid?: string) {
    progressRef.current = value;
    setProgress(value);
    write(profileCacheKey(uid), value);
  }
  useEffect(() => {
    let alive = true,
      unsubscribe = () => {};
    let client: ReturnType<typeof firebaseClient>;
    try {
      client = firebaseClient();
    } catch {
      display(read(profileCacheKey()));
      setError("Account services couldn’t start. Reading is still available.");
      setReady(true);
      return;
    }
    if (!client) {
      display(read(profileCacheKey()));
      setReady(true);
      return;
    }
    const { auth, db } = client;
    const stop = onAuthStateChanged(
      auth,
      (account) => {
        if (!alive) return;
        unsubscribe();
        const token = ++version.current;
        const active = () => alive && version.current === token;
        current.current = account;
        setUser(account);
        setReady(true);
        setError("");
        revision.current = 0;
        if (!account) {
          pending.current = emptyProgress();
          flush.current = () => {};
          display(read(profileCacheKey()));
          setSync("local");
          return;
        }
        const uid = account.uid,
          reference = doc(db, "users", uid);
        pending.current = read(pendingCacheKey(uid));
        const importKey = `half-full-import:${uid}`;
        let guest = read(importKey);
        const deviceGuest = read(profileCacheKey());
        if (hasProgress(deviceGuest)) {
          const combined = applyProgress(guest, deviceGuest);
          try {
            localStorage.setItem(importKey, JSON.stringify(combined));
            localStorage.removeItem(profileCacheKey());
            guest = combined;
          } catch {
            /* Keep the original guest data if it cannot be moved safely. */
          }
        }
        let imported = !hasProgress(guest),
          writing = false,
          listening = false;
        display(
          applyProgress(
            importGuest(read(profileCacheKey(uid)), guest),
            pending.current,
          ),
          uid,
        );
        setSync("syncing");
        async function save() {
          if (!active() || writing) return;
          const patch = structuredClone(pending.current),
            change = revision.current;
          const needsImport = !imported;
          // Also ensure the initial profile exists, without rewriting it on snapshots.
          writing = true;
          setSync("syncing");
          try {
            await runTransaction(db, async (transaction) => {
              const snapshot = await transaction.get(reference);
              if (!active() || auth.currentUser?.uid !== uid)
                throw Error("Account changed");
              const remote = cleanProgress(snapshot.data());
              const merged = applyProgress(
                needsImport ? importGuest(remote, guest) : remote,
                patch,
              );
              transaction.set(
                reference,
                {
                  ...merged,
                  displayName: account!.displayName ?? "",
                  email: account!.email ?? "",
                  photoURL: account!.photoURL ?? "",
                  updatedAt: serverTimestamp(),
                },
                {
                  mergeFields: [
                    "days",
                    "reactions",
                    "displayName",
                    "email",
                    "photoURL",
                    "updatedAt",
                  ],
                },
              );
            });
            if (!active()) return;
            if (needsImport) {
              imported = true;
              guest = emptyProgress();
              try {
                localStorage.removeItem(importKey);
              } catch {}
            }
            if (change === revision.current) {
              pending.current = emptyProgress();
              write(pendingCacheKey(uid), pending.current);
            }
            setSync("saved");
            setError("");
            if (!listening) watch();
          } catch (e) {
            if (active()) {
              setSync("error");
              setError(
                navigator.onLine
                  ? authMessage((e as { code?: string }).code)
                  : "Offline. Your changes will sync when you reconnect.",
              );
            }
          } finally {
            writing = false;
            if (active() && revision.current !== change) void save();
          }
        }
        flush.current = () => {
          void save();
        };
        function watch() {
          listening = true;
          unsubscribe = onSnapshot(
            reference,
            (snapshot) => {
              if (!active()) return;
              if (!snapshot.exists() && snapshot.metadata.fromCache) return;
              const remote = cleanProgress(snapshot.data());
              display(
                applyProgress(
                  imported ? remote : importGuest(remote, guest),
                  pending.current,
                ),
                uid,
              );
              if (
                imported &&
                !hasProgress(pending.current) &&
                !snapshot.metadata.hasPendingWrites &&
                !snapshot.metadata.fromCache
              )
                setSync("saved");
            },
            (e) => {
              listening = false;
              if (active()) {
                setSync("error");
                setError(authMessage(e.code));
              }
            },
          );
        }
        watch();
        void save();
      },
      () => {
        if (alive) {
          display(read(profileCacheKey()));
          setReady(true);
          setError(
            "Account services are unavailable. Reading is still available.",
          );
        }
      },
    );
    const online = () => flush.current();
    window.addEventListener("online", online);
    return () => {
      alive = false;
      ++version.current;
      stop();
      unsubscribe();
      window.removeEventListener("online", online);
    };
  }, []);
  function saveProgress(
    next: ReadingProgress | ((previous: ReadingProgress) => ReadingProgress),
  ) {
    const value = cleanProgress(
        typeof next === "function" ? next(progressRef.current) : next,
      ),
      account = current.current;
    if (account) {
      pending.current = applyProgress(
        pending.current,
        progressPatch(progressRef.current, value),
      );
      ++revision.current;
      write(pendingCacheKey(account.uid), pending.current);
      display(value, account.uid);
      flush.current();
    } else display(value);
  }
  async function login() {
    setError("");
    setSigningIn(true);
    try {
      const client = firebaseClient();
      if (!client) throw Error("Missing configuration");
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      await persistentAuth();
      await signInWithPopup(client.auth, provider);
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (
        code !== "auth/popup-closed-by-user" &&
        code !== "auth/cancelled-popup-request"
      )
        setError(authMessage(code));
    } finally {
      setSigningIn(false);
    }
  }
  async function logout() {
    setError("");
    try {
      const client = firebaseClient();
      if (client) await signOut(client.auth);
    } catch {
      setError("Couldn’t sign out. Please try again.");
    }
  }
  return {
    user,
    ready,
    signingIn,
    progress,
    saveProgress,
    sync,
    error,
    login,
    logout,
    retry: () => flush.current(),
  };
}

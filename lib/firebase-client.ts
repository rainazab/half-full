"use client";
import { getApp, getApps, initializeApp } from "firebase/app";
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
} from "firebase/auth";
let persistence: Promise<void> | undefined;
export function persistentAuth() {
  const client = firebaseClient();
  if (!client) return Promise.resolve();
  return (persistence ??= setPersistence(
    client.auth,
    browserLocalPersistence,
  ).catch((error) => {
    persistence = undefined;
    throw error;
  }));
}
import { getFirestore } from "firebase/firestore";

// These are Firebase's public web-app identifiers, never Admin SDK credentials.
const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};
export function firebaseClient() {
  if (
    !config.apiKey ||
    !config.authDomain ||
    !config.projectId ||
    !config.appId
  )
    return null;
  const app = getApps().length ? getApp() : initializeApp(config);
  return { auth: getAuth(app), db: getFirestore(app) };
}

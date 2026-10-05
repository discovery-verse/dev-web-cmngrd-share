import { getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { connectAuthEmulator, getAuth, type Auth } from "firebase/auth";
import {
  connectFirestoreEmulator,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from "firebase/firestore";
import { connectStorageEmulator, getStorage, type FirebaseStorage } from "firebase/storage";

/**
 * Demo mode: build with NEXT_PUBLIC_USE_EMULATORS=1 to run entirely against
 * the local Firebase emulators (no real project, no real emails). See
 * "Demo mode" in the README.
 */
export const isDemo = process.env.NEXT_PUBLIC_USE_EMULATORS === "1";
export const DEMO_PROJECT_ID = "demo-cg";
export const AUTH_EMULATOR_URL = "http://localhost:9299";
const FIRESTORE_EMULATOR_PORT = 8765;
const STORAGE_EMULATOR_PORT = 9199;

const firebaseConfig = isDemo
  ? {
      apiKey: "demo-api-key",
      authDomain: "localhost",
      projectId: DEMO_PROJECT_ID,
      storageBucket: `${DEMO_PROJECT_ID}.appspot.com`,
      appId: "1:demo:web:demo",
    }
  : {
      apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
      authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
      appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    };

// NEXT_PUBLIC_* vars are inlined at build time, so this is identical on
// server and client (no hydration mismatch). When false, the UI shows a
// setup notice instead of crashing on Firebase init.
export const firebaseConfigured = !!(
  firebaseConfig.apiKey &&
  firebaseConfig.projectId &&
  firebaseConfig.appId
);

// Firebase is only ever exercised in the browser (auth flows, snapshot
// listeners in effects, event handlers). Server prerendering just emits the
// loading shell, so skip initialisation there — it would otherwise demand
// real credentials at build time.
const isBrowser = typeof window !== "undefined";
const live = isBrowser && firebaseConfigured;

export const app: FirebaseApp = live
  ? (getApps()[0] ?? initializeApp(firebaseConfig))
  : ({} as FirebaseApp);

export const auth: Auth = live ? getAuth(app) : ({} as Auth);

// Persistent local cache keeps already-loaded directory/board/message data
// viewable offline (PWA requirement) and smooths out flaky venue wifi.
//
// Optional named Firestore database. Empty (demo/local, or a project that uses
// the default database) → the SDK uses "(default)", which the emulator serves.
const firestoreSettings = {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
};
const firestoreDbId = isDemo ? "" : process.env.NEXT_PUBLIC_FIRESTORE_DB_ID || "";
export const db: Firestore = live
  ? firestoreDbId
    ? initializeFirestore(app, firestoreSettings, firestoreDbId)
    : initializeFirestore(app, firestoreSettings)
  : ({} as Firestore);

// Cloud Storage hosts user-uploaded images (avatars, profile covers, idea and
// room images). The bucket is shared across sibling apps, so every object we
// write is namespaced under `cmngrd/` — see src/lib/upload.ts and storage.rules.
export const storage: FirebaseStorage = live ? getStorage(app) : ({} as FirebaseStorage);

if (live && isDemo) {
  connectAuthEmulator(auth, AUTH_EMULATOR_URL, { disableWarnings: true });
  connectFirestoreEmulator(db, "localhost", FIRESTORE_EMULATOR_PORT);
  connectStorageEmulator(storage, "localhost", STORAGE_EMULATOR_PORT);
}

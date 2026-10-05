/**
 * App-wide feature flags.
 *
 * DM scope toggle (feature #3): flip `dmRequiresConnection` on the Firestore
 * doc `config/app` (see scripts/seed.mjs). It is read live by both the UI
 * (this hook) and the Firestore security rules, so flipping the single field
 * changes enforcement everywhere — no deploy needed.
 */
"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { AppConfig } from "@/lib/types";

export const DEFAULT_CONFIG: AppConfig = {
  dmRequiresConnection: false,
};

export function useAppConfig(enabled: boolean): AppConfig {
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);

  useEffect(() => {
    if (!enabled) return;
    return onSnapshot(
      doc(db, "config", "app"),
      (snap) => {
        const data = snap.data();
        setConfig({
          dmRequiresConnection: data?.dmRequiresConnection === true,
        });
      },
      () => setConfig(DEFAULT_CONFIG),
    );
  }, [enabled]);

  return config;
}

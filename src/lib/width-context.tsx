"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

/** localStorage key for the member's desktop column-width preference. */
const WIDTH_KEY = "cg-column-width";

export type ColumnWidth = "narrow" | "wide";

const COLUMN_WIDTHS: ColumnWidth[] = ["narrow", "wide"];

/**
 * How wide the app column runs on desktop. Everything is desktop-gated via the
 * `lg:` breakpoint — below it these fragments are inert and the app keeps its
 * normal full-width mobile layout, so the phone/PWA experience never changes.
 *
 * The map holds complete literal class strings (not computed) so Tailwind's
 * scanner can see them.
 */
const COLUMN_WIDTH: Record<ColumnWidth, string> = {
  narrow: "",
  wide: "lg:max-w-6xl",
};

interface WidthState {
  width: ColumnWidth;
  setWidth: (width: ColumnWidth) => void;
  /** Class fragment for the shell column and the bottom-nav inner row. */
  columnWidth: string;
}

const WidthContext = createContext<WidthState | null>(null);

export function WidthProvider({ children }: { children: ReactNode }) {
  // Start wide (the SSR-safe default) and adopt the saved width on mount.
  const [width, setWidthState] = useState<ColumnWidth>("wide");

  useEffect(() => {
    const saved = window.localStorage.getItem(WIDTH_KEY);
    // Post-hydration adoption of a client-only preference; reading
    // localStorage during render would mismatch the server HTML.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (COLUMN_WIDTHS.includes(saved as ColumnWidth)) setWidthState(saved as ColumnWidth);
  }, []);

  function setWidth(next: ColumnWidth) {
    setWidthState(next);
    window.localStorage.setItem(WIDTH_KEY, next);
  }

  return (
    <WidthContext.Provider value={{ width, setWidth, columnWidth: COLUMN_WIDTH[width] }}>
      {children}
    </WidthContext.Provider>
  );
}

export function useColumnWidth(): WidthState {
  const ctx = useContext(WidthContext);
  if (!ctx) throw new Error("useColumnWidth must be used inside WidthProvider");
  return ctx;
}

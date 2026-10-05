"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import type { CommunityEvent } from "@/lib/types";

/** localStorage key for the member's last-selected event; also seeded by per-event sign-in links. */
export const EVENT_KEY = "cg-current-event";

interface EventState {
  /** null while loading. */
  allEvents: CommunityEvent[] | null;
  /** Events this member may enter (admins: all events). */
  approvedEvents: CommunityEvent[];
  /** The active event; null = not approved for any yet (awaiting admin). */
  currentEvent: CommunityEvent | null;
  switchEvent: (id: string) => void;
}

const EventContext = createContext<EventState | null>(null);

export function EventProvider({ children }: { children: ReactNode }) {
  const { member, isAdmin } = useAuth();
  const [allEvents, setAllEvents] = useState<CommunityEvent[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    const q = query(collection(db, "events"), orderBy("order"));
    return onSnapshot(q, (snap) => {
      setAllEvents(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as CommunityEvent));
    });
  }, []);

  // Restore last-used event after hydration.
  useEffect(() => {
    const stored = window.localStorage.getItem(EVENT_KEY);
    if (stored) void Promise.resolve().then(() => setSelectedId(stored));
  }, []);

  const approvedEvents = useMemo(() => {
    if (!allEvents) return [];
    if (isAdmin) return allEvents;
    return allEvents.filter((e) => member?.events?.includes(e.id));
  }, [allEvents, member, isAdmin]);

  // Fall back to the first approved event when the stored one isn't allowed.
  const currentEvent =
    approvedEvents.find((e) => e.id === selectedId) ?? approvedEvents[0] ?? null;

  const switchEvent = (id: string) => {
    setSelectedId(id);
    window.localStorage.setItem(EVENT_KEY, id);
  };

  return (
    <EventContext.Provider value={{ allEvents, approvedEvents, currentEvent, switchEvent }}>
      {children}
    </EventContext.Provider>
  );
}

export function useEvent(): EventState {
  const ctx = useContext(EventContext);
  if (!ctx) throw new Error("useEvent must be used inside <EventProvider>");
  return ctx;
}

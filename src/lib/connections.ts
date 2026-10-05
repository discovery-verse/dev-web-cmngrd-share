"use client";

import { useEffect, useState } from "react";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { otherUid, pairId } from "@/lib/utils";
import type { Connection } from "@/lib/types";

/**
 * Live view of the connection between me and another member.
 * `undefined` = still loading, `null` = no connection doc exists.
 */
export function useConnection(myUid: string, otherUid: string) {
  const valid = !!myUid && !!otherUid && myUid !== otherUid;
  const id = valid ? pairId(myUid, otherUid) : "";
  // Keyed by pair id so a stale doc never shows for a different pair.
  const [state, setState] = useState<{ id: string; connection: Connection | null }>();

  useEffect(() => {
    if (!id) return;
    return onSnapshot(
      doc(db, "connections", id),
      (snap) =>
        setState({
          id,
          connection: snap.exists() ? ({ id: snap.id, ...snap.data() } as Connection) : null,
        }),
      () => setState({ id, connection: null }),
    );
  }, [id]);

  if (!valid) return null;
  return state?.id === id ? state.connection : undefined;
}

/**
 * Live map of ALL my connections, keyed by the *other* member's uid, so the
 * directory can badge each row (pending vs accepted) without a per-row listener.
 * Covers both pending and accepted — the query is unconstrained on status.
 *
 * Returns `null` until the first snapshot lands, so callers can tell "not
 * loaded yet" apart from "no connections" — the difference between holding off
 * and confidently showing a "Connect" button.
 */
export function useMyConnections(myUid: string) {
  const [map, setMap] = useState<Map<string, Connection> | null>(null);

  useEffect(() => {
    if (!myUid) return;
    const q = query(collection(db, "connections"), where("users", "array-contains", myUid));
    return onSnapshot(
      q,
      (snap) => {
        const next = new Map<string, Connection>();
        for (const d of snap.docs) {
          const c = { id: d.id, ...d.data() } as Connection;
          next.set(otherUid(c.users, myUid), c);
        }
        setMap(next);
      },
      () => setMap(new Map()),
    );
  }, [myUid]);

  return map;
}

/** Send a connection request (creates the pending pair doc). */
export function requestConnection(myUid: string, otherUid: string) {
  const id = pairId(myUid, otherUid);
  return setDoc(doc(db, "connections", id), {
    users: id.split("_"),
    requestedBy: myUid,
    status: "pending",
    createdAt: serverTimestamp(),
  });
}

/** Recipient accepts — unlocks each other's private contact docs via rules. */
export function acceptConnection(connectionId: string) {
  return updateDoc(doc(db, "connections", connectionId), { status: "accepted" });
}

/**
 * Decline a request, cancel one you sent, or remove an accepted connection.
 * Deleting the doc re-locks contact details in both directions immediately.
 */
export function removeConnection(connectionId: string) {
  return deleteDoc(doc(db, "connections", connectionId));
}

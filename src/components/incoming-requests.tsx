"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { acceptConnection, removeConnection } from "@/lib/connections";
import { normalizeMember, type Connection, type Member } from "@/lib/types";
import { doc, getDoc } from "firebase/firestore";
import { otherUid } from "@/lib/utils";
import { Avatar, Button } from "@/components/ui";

interface PendingRequest {
  connection: Connection;
  from: Member;
}

/** Banner list of connection requests waiting for my answer. */
export function IncomingRequests() {
  const { user } = useAuth();
  const myUid = user!.uid;
  const [requests, setRequests] = useState<PendingRequest[]>([]);

  useEffect(() => {
    const q = query(
      collection(db, "connections"),
      where("users", "array-contains", myUid),
      where("status", "==", "pending"),
    );
    return onSnapshot(q, async (snap) => {
      const incoming = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }) as Connection)
        .filter((c) => c.requestedBy !== myUid);
      const withMembers = await Promise.all(
        incoming.map(async (connection) => {
          const from = await getDoc(doc(db, "members", otherUid(connection.users, myUid)));
          return from.exists()
            ? { connection, from: normalizeMember(from.id, from.data()) }
            : null;
        }),
      );
      setRequests(withMembers.filter((r): r is PendingRequest => r !== null));
    });
  }, [myUid]);

  if (requests.length === 0) return null;

  return (
    <section aria-label="Connection requests" className="mx-4 mb-3 space-y-2">
      {requests.map(({ connection, from }) => (
        <div
          key={connection.id}
          className="flex items-center gap-3 rounded-card border border-clay/20 bg-clay-soft/50 p-3.5"
        >
          <Link href={`/people/${from.uid}`} className="flex min-w-0 flex-1 items-center gap-3">
            <Avatar name={from.name} uid={from.uid} size="sm" />
            <div className="min-w-0">
              <p className="truncate text-sm font-bold">{from.name}</p>
              <p className="truncate text-[12px] text-soft">wants to connect</p>
            </div>
          </Link>
          <div className="flex shrink-0 gap-1.5">
            <Button
              className="min-h-9 px-3.5 text-[13px]"
              onClick={() => acceptConnection(connection.id)}
            >
              Accept
            </Button>
            <Button
              variant="ghost"
              className="min-h-9 px-3 text-[13px]"
              onClick={() => removeConnection(connection.id)}
            >
              Decline
            </Button>
          </div>
        </div>
      ))}
    </section>
  );
}

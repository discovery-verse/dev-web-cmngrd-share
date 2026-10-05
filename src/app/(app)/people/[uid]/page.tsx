"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import {
  ArrowLeft,
  Briefcase,
  Check,
  Code2,
  Flag,
  Globe,
  Link2,
  Lock,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  Share2,
  UserCheck,
  UserPlus,
  UserX,
} from "lucide-react";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { useEvent } from "@/lib/event-context";
import {
  acceptConnection,
  removeConnection,
  requestConnection,
  useConnection,
} from "@/lib/connections";
import { submitReport } from "@/lib/moderation";
import {
  LINK_TYPE_LABELS,
  normalizeLinks,
  normalizeMember,
  type ContactCard,
  type LinkType,
  type Member,
} from "@/lib/types";
import { Avatar, Button, CoverBanner, GroupChip, LoadingScreen } from "@/components/ui";

export default function MemberProfilePage() {
  const { uid } = useParams<{ uid: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { currentEvent } = useEvent();
  const dmRequiresConnection = currentEvent?.dmRequiresConnection ?? false;
  const myUid = user!.uid;
  const isSelf = uid === myUid;

  const [member, setMember] = useState<Member | null | undefined>(undefined);
  const connection = useConnection(myUid, uid);
  const isConnected = connection?.status === "accepted";

  // Private contact card: only subscribe once connected (or viewing self).
  // Even if this subscription were attempted earlier, Firestore rules deny it.
  const unlocked = isConnected || isSelf;
  const [contactState, setContactState] = useState<{
    key: string;
    contact: ContactCard | null;
  }>();
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reported, setReported] = useState(false);

  useEffect(() => {
    return onSnapshot(doc(db, "members", uid), (snap) => {
      setMember(snap.exists() ? normalizeMember(snap.id, snap.data()) : null);
    });
  }, [uid]);

  useEffect(() => {
    if (!unlocked) return;
    return onSnapshot(
      doc(db, "members", uid, "private", "contact"),
      (snap) =>
        setContactState({ key: uid, contact: snap.exists() ? (snap.data() as ContactCard) : null }),
      () => setContactState({ key: uid, contact: null }),
    );
  }, [uid, unlocked]);

  const contact = unlocked && contactState?.key === uid ? contactState.contact : null;

  if (member === undefined || connection === undefined) return <LoadingScreen />;
  if (member === null) {
    return (
      <div className="px-6 py-16 text-center text-soft">
        <p>This member is no longer part of the community.</p>
      </div>
    );
  }

  const canMessage = !isSelf && (!dmRequiresConnection || isConnected);

  async function withBusy(fn: () => Promise<unknown>) {
    setBusy(true);
    setActionError(null);
    try {
      await fn();
    } catch (err) {
      console.error("connection action failed", err);
      setActionError("Something went wrong — please check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="px-4">
      <div className="flex items-center justify-between py-3">
        <button
          onClick={() => router.back()}
          aria-label="Back"
          className="-ml-2 flex size-10 items-center justify-center rounded-full text-soft hover:bg-line/50"
        >
          <ArrowLeft className="size-5" aria-hidden />
        </button>
        {!isSelf && (
          <button
            onClick={() =>
              withBusy(async () => {
                await submitReport({
                  targetType: "member",
                  targetPath: `members/${uid}`,
                  excerpt: member!.name,
                  reporterId: myUid,
                });
                setReported(true);
              })
            }
            disabled={reported}
            className="flex items-center gap-1.5 rounded-full px-3 py-2 text-[13px] font-semibold text-faint hover:text-soft disabled:opacity-60"
          >
            <Flag className="size-3.5" aria-hidden />
            {reported ? "Reported" : "Report"}
          </button>
        )}
      </div>

      <div className="overflow-hidden rounded-card bg-surface shadow-card">
        <CoverBanner seed={member.uid} imageUrl={member.coverUrl} className="h-24" />
        <div className="p-6 pt-0">
        <div className="flex flex-col items-center gap-3 text-center">
          <Avatar name={member.name} uid={member.uid} src={member.photoUrl} size="lg" className="relative z-10 -mt-8 ring-4 ring-surface" />
          <div>
            <h1 className="text-xl font-bold">{member.name}</h1>
            <p className="mt-0.5 text-[15px] text-soft">
              {member.title}
              {member.title && member.company ? " · " : ""}
              {member.company}
            </p>
          </div>
          <GroupChip groups={member.groups} />
        </div>

        {!isSelf && (
          <div className="mt-6 flex flex-col gap-2">
            {connection === null && (
              <Button
                loading={busy}
                onClick={() => withBusy(() => requestConnection(myUid, uid))}
              >
                <UserPlus className="size-4" aria-hidden />
                Connect
              </Button>
            )}
            {connection?.status === "pending" && connection.requestedBy === myUid && (
              <Button
                variant="secondary"
                loading={busy}
                onClick={() => withBusy(() => removeConnection(connection.id))}
              >
                <Check className="size-4" aria-hidden />
                Requested — tap to cancel
              </Button>
            )}
            {connection?.status === "pending" && connection.requestedBy !== myUid && (
              <div className="space-y-2">
                <p className="text-center text-sm text-soft">
                  {member.name.split(" ")[0]} would like to connect with you.
                </p>
                <div className="flex gap-2">
                  <Button
                    className="flex-1"
                    loading={busy}
                    onClick={() => withBusy(() => acceptConnection(connection.id))}
                  >
                    Accept
                  </Button>
                  <Button
                    variant="ghost"
                    className="flex-1"
                    disabled={busy}
                    onClick={() => withBusy(() => removeConnection(connection.id))}
                  >
                    Decline
                  </Button>
                </div>
              </div>
            )}
            {isConnected && (
              <div className="flex items-center justify-center gap-1.5 rounded-full bg-sage-soft py-2 text-sm font-semibold text-sage">
                <UserCheck className="size-4" aria-hidden />
                Connected
              </div>
            )}
            {canMessage && (
              <Link href={`/messages/with/${uid}`} className="contents">
                <Button variant={connection === null ? "secondary" : "primary"} className="w-full">
                  <MessageCircle className="size-4" aria-hidden />
                  Message
                </Button>
              </Link>
            )}
            {!canMessage && !isSelf && dmRequiresConnection && !isConnected && (
              <p className="text-center text-[13px] text-faint">
                Messaging opens up once you&apos;re connected.
              </p>
            )}
            {actionError && (
              <p className="text-center text-[13px] text-danger">{actionError}</p>
            )}
          </div>
        )}
        </div>
      </div>

      {/* Public "get to know you" fields — visible to every member, unlike the
          gated contact card below. */}
      {(member.location || member.about || member.interests) && (
        <div className="mt-4 space-y-4 rounded-card bg-surface p-6 shadow-card">
          {member.location && (
            <div className="flex items-center gap-2 text-[15px] text-soft">
              <MapPin className="size-4 shrink-0 text-faint" aria-hidden />
              <span>{member.location}</span>
            </div>
          )}
          {member.about && (
            <div>
              <h2 className="text-[13px] font-bold uppercase tracking-wide text-faint">About</h2>
              <p className="mt-2 whitespace-pre-wrap text-[15px] leading-relaxed">{member.about}</p>
            </div>
          )}
          {member.interests && (
            <div>
              <h2 className="text-[13px] font-bold uppercase tracking-wide text-faint">
                Interests &amp; redemptive burden
              </h2>
              <p className="mt-2 whitespace-pre-wrap text-[15px] leading-relaxed">{member.interests}</p>
            </div>
          )}
        </div>
      )}

      {/* Contact card — rendered only when unlocked; the data itself is
          gated by Firestore rules, so an unconnected client can't fetch it. */}
      <div className="mt-4 rounded-card bg-surface p-6 shadow-card">
        <h2 className="text-[13px] font-bold uppercase tracking-wide text-faint">
          Contact details
        </h2>
        {isSelf || isConnected ? (
          contact ? (
            <ul className="mt-3 space-y-3">
              {contact.email && (
                <ContactRow icon={<Mail className="size-4" aria-hidden />} label="Email">
                  <a className="text-clay underline-offset-2 hover:underline" href={`mailto:${contact.email}`}>
                    {contact.email}
                  </a>
                </ContactRow>
              )}
              {contact.phone && (
                <ContactRow icon={<Phone className="size-4" aria-hidden />} label="Phone">
                  <a className="text-clay underline-offset-2 hover:underline" href={`tel:${contact.phone}`}>
                    {contact.phone}
                  </a>
                </ContactRow>
              )}
              {contact.linkedin && (
                <ContactRow icon={<Globe className="size-4" aria-hidden />} label="LinkedIn">
                  <a
                    className="break-all text-clay underline-offset-2 hover:underline"
                    href={
                      contact.linkedin.startsWith("http")
                        ? contact.linkedin
                        : `https://${contact.linkedin}`
                    }
                    target="_blank"
                    rel="noreferrer"
                  >
                    {contact.linkedin}
                  </a>
                </ContactRow>
              )}
              {normalizeLinks(contact.links).map((link, i) => (
                <ContactRow key={i} icon={<LinkIcon type={link.type} />} label={LINK_TYPE_LABELS[link.type]}>
                  <a
                    className="break-all text-clay underline-offset-2 hover:underline"
                    href={link.url.startsWith("http") ? link.url : `https://${link.url}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {link.url}
                  </a>
                </ContactRow>
              ))}
              {!contact.email &&
                !contact.phone &&
                !contact.linkedin &&
                normalizeLinks(contact.links).length === 0 && (
                  <p className="text-sm text-soft">No contact details shared yet.</p>
                )}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-soft">Loading…</p>
          )
        ) : (
          <div className="mt-3 flex items-start gap-3 text-soft">
            <Lock className="mt-0.5 size-4 shrink-0" aria-hidden />
            <p className="text-sm leading-relaxed">
              {member.name.split(" ")[0]}&apos;s email, phone, LinkedIn, and links unlock for both
              of you once they accept your connection.
            </p>
          </div>
        )}
      </div>

      {isConnected && (
        <button
          onClick={() => withBusy(() => removeConnection(connection!.id))}
          disabled={busy}
          className="mx-auto mt-6 flex items-center gap-1.5 text-[13px] font-semibold text-faint hover:text-danger"
        >
          <UserX className="size-3.5" aria-hidden />
          Remove connection
        </button>
      )}
    </div>
  );
}

/** Small per-category icon for a member link row. */
function LinkIcon({ type }: { type: LinkType }) {
  const cls = "size-4";
  if (type === "projects") return <Briefcase className={cls} aria-hidden />;
  if (type === "social") return <Share2 className={cls} aria-hidden />;
  if (type === "github") return <Code2 className={cls} aria-hidden />;
  if (type === "website") return <Globe className={cls} aria-hidden />;
  return <Link2 className={cls} aria-hidden />;
}

function ContactRow({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-start gap-3">
      <span className="mt-0.5 text-faint">{icon}</span>
      <div className="min-w-0">
        <p className="text-[12px] font-semibold text-faint">{label}</p>
        <p className="text-[15px]">{children}</p>
      </div>
    </li>
  );
}

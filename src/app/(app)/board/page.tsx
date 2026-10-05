"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { collection, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { Columns3, Heart, ImagePlus, LayoutGrid, Lightbulb, MessageCircle, Plus, X } from "lucide-react";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { useEvent } from "@/lib/event-context";
import { AwaitingAccess } from "@/components/event-switcher";
import { createPost, toggleReaction } from "@/lib/board";
import { uploadUserImage, UploadError } from "@/lib/upload";
import { BOARD_TOPICS, TOPIC_STYLES } from "@/lib/constants";
import type { Post } from "@/lib/types";
import { cn, normalizeLink, shortTime } from "@/lib/utils";
import { Button, CoverBanner, EmptyState, Field, ImagePickerButton, Input, LoadingScreen, PageHeader, Textarea, ViewToggle } from "@/components/ui";

type SortMode = "recent" | "loved";
type ViewMode = "wall" | "board";
const VIEW_KEY = "cg-board-view";

export default function BoardPage() {
  const { user, member } = useAuth();
  const { currentEvent } = useEvent();
  const myUid = user!.uid;
  // Keyed by event id so switching events never flashes the previous wall.
  const [postState, setPostState] = useState<{ eventId: string; posts: Post[] }>();
  const [topic, setTopic] = useState<string>("all");
  const [sort, setSort] = useState<SortMode>("recent");
  const [view, setView] = useState<ViewMode>("wall");
  const [composing, setComposing] = useState(false);

  // Restore the preferred view after hydration (server always renders wall).
  useEffect(() => {
    const stored = window.localStorage.getItem(VIEW_KEY);
    if (stored === "board") void Promise.resolve().then(() => setView("board"));
  }, []);

  function switchView(mode: ViewMode) {
    setView(mode);
    window.localStorage.setItem(VIEW_KEY, mode);
  }

  const eventId = currentEvent?.id;

  useEffect(() => {
    if (!eventId) return;
    const q = query(
      collection(db, "posts"),
      where("eventId", "==", eventId),
      orderBy("createdAt", "desc"),
    );
    return onSnapshot(q, (snap) => {
      setPostState({
        eventId,
        posts: snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Post),
      });
    });
  }, [eventId]);

  const posts = postState && postState.eventId === eventId ? postState.posts : null;

  const visible = useMemo(() => {
    if (!posts) return [];
    const filtered = topic === "all" ? posts : posts.filter((p) => p.topic === topic);
    if (sort === "loved") {
      return [...filtered].sort((a, b) => b.reactionCount - a.reactionCount);
    }
    return filtered;
  }, [posts, topic, sort]);

  if (!currentEvent) {
    return (
      <div>
        <PageHeader title="Boards" />
        <AwaitingAccess />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Boards"
        subtitle="Finding Common Ground in Community"
        action={
          <div className="flex flex-col items-end gap-2">
            <ViewToggle
              value={view}
              onChange={switchView}
              options={[
                { value: "wall", label: "Wall view", icon: <LayoutGrid className="size-4" aria-hidden /> },
                { value: "board", label: "Board view", icon: <Columns3 className="size-4" aria-hidden /> },
              ]}
            />
            <button
              onClick={() => setComposing(true)}
              className="attention-shimmer flex h-11 shrink-0 items-center gap-1.5 rounded-full bg-clay pl-3 pr-4 text-[13px] font-bold text-white shadow-raised"
            >
              <Plus className="size-4" aria-hidden />
              Start a discussion
            </button>
          </div>
        }
      />

      <div className="sticky top-12 z-30 space-y-2 bg-paper/95 px-4 pb-3 pt-1 backdrop-blur">
        <div className="flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none]">
          <TopicChip label="All" active={topic === "all"} onClick={() => setTopic("all")} />
          {BOARD_TOPICS.map((t) => (
            <TopicChip key={t} label={t} active={topic === t} onClick={() => setTopic(t)} />
          ))}
        </div>
        <div className="flex gap-1.5">
          {(
            [
              ["recent", "Recent"],
              ["loved", "Most loved"],
            ] as const
          ).map(([mode, label]) => (
            <button
              key={mode}
              onClick={() => setSort(mode)}
              aria-pressed={sort === mode}
              className={cn(
                "rounded-full px-3 py-1 text-[12px] font-semibold",
                sort === mode ? "bg-clay-soft text-clay-deep" : "text-faint hover:text-soft",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {posts === null ? (
        <LoadingScreen />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={<Lightbulb className="size-8" aria-hidden />}
          title="Nothing on the wall yet"
          body="Share an idea, an ask, or an offer to get things going."
        >
          <Button variant="secondary" onClick={() => setComposing(true)}>
            Write the first post
          </Button>
        </EmptyState>
      ) : view === "wall" ? (
        <PostWall posts={visible} myUid={myUid} />
      ) : (
        <PostBoard posts={visible} myUid={myUid} onCompose={() => setComposing(true)} />
      )}

      {composing && member && (
        <Composer eventId={currentEvent.id} onClose={() => setComposing(false)} />
      )}
    </div>
  );
}

/* ------------------------------- Wall view --------------------------------- */
/* Padlet-style masonry mosaic of cover cards. */

function PostWall({ posts, myUid }: { posts: Post[]; myUid: string }) {
  return (
    <div className="columns-2 gap-3 px-4 pt-1 min-[480px]:columns-2">
      {posts.map((p) => {
        const styles = TOPIC_STYLES[p.topic] ?? TOPIC_STYLES.Ideas;
        return (
          <PostCard
            key={p.id}
            post={p}
            myUid={myUid}
            styles={styles}
            className="mb-3 break-inside-avoid"
          />
        );
      })}
    </div>
  );
}

/* ------------------------------- Board view -------------------------------- */
/* Kanban: one column per topic, cards stacked within. Horizontal snap-scroll
   on mobile — matches the Rooms board pattern. */

function PostBoard({
  posts,
  myUid,
  onCompose,
}: {
  posts: Post[];
  myUid: string;
  onCompose: () => void;
}) {
  // Group into topic columns, preserving the incoming sort order within each.
  const columns = BOARD_TOPICS.map((topic) => ({
    topic,
    posts: posts.filter((p) => p.topic === topic),
  })).filter((col) => col.posts.length > 0);

  return (
    <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 pt-1 [-webkit-overflow-scrolling:touch]">
      {columns.map(({ topic, posts: colPosts }) => {
        const styles = TOPIC_STYLES[topic] ?? TOPIC_STYLES.Ideas;
        const TopicIcon = styles.icon;
        return (
          <section
            key={topic}
            aria-label={topic}
            className="flex w-[280px] shrink-0 snap-start flex-col gap-2"
          >
            <div className="flex items-center justify-between gap-2 px-1">
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-bold uppercase tracking-wide",
                  styles.chip,
                )}
              >
                <TopicIcon className="size-3.5" aria-hidden />
                {topic}
              </span>
              <span className="text-[12px] font-bold text-faint">{colPosts.length}</span>
            </div>

            {colPosts.map((p) => (
              <PostCard key={p.id} post={p} myUid={myUid} styles={styles} />
            ))}

            <button
              onClick={onCompose}
              className="rounded-card border border-dashed border-line py-2.5 text-center text-[13px] font-semibold text-soft hover:border-clay hover:text-clay"
            >
              + Add to {topic}
            </button>
          </section>
        );
      })}
    </div>
  );
}

function PostCard({
  post: p,
  myUid,
  styles,
  className,
}: {
  post: Post;
  myUid: string;
  styles: (typeof TOPIC_STYLES)[string];
  className?: string;
}) {
  const TopicIcon = styles.icon;
  const reacted = p.reactedBy?.includes(myUid);
  return (
    <div className={cn("overflow-hidden rounded-card bg-surface shadow-card", className)}>
      <Link href={`/board/${p.id}`} className="block">
        <CoverBanner seed={p.id} imageUrl={p.imageUrl} className="flex h-24 items-center justify-center">
          {!p.imageUrl && <TopicIcon className="size-9 text-white/85" aria-hidden />}
          <span className="absolute left-2.5 top-2.5 inline-flex items-center gap-1 rounded-full bg-white/85 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-ink">
            <TopicIcon className="size-3" aria-hidden />
            {p.topic}
          </span>
        </CoverBanner>
      </Link>
      <Link href={`/board/${p.id}`} className="block px-3.5 pt-3">
        <h2 className="text-[15px] font-bold leading-snug">{p.title}</h2>
        {p.body && (
          <p className="mt-1 line-clamp-3 text-[13px] leading-relaxed text-soft">{p.body}</p>
        )}
        <p className="mt-2 text-[11px] font-medium text-faint">
          {p.authorName} · {shortTime(p.createdAt)}
        </p>
      </Link>
      <div className="flex items-center gap-1 px-2 py-1.5">
        <button
          onClick={() => toggleReaction(p.id, myUid, !!reacted).catch(() => {})}
          aria-pressed={reacted}
          aria-label={reacted ? "Remove reaction" : "React"}
          className={cn(
            "flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[12px] font-semibold",
            reacted ? "text-clay" : "text-faint hover:text-soft",
          )}
        >
          <Heart className={cn("size-4", reacted && "fill-clay")} aria-hidden />
          {p.reactionCount > 0 && p.reactionCount}
        </button>
        <Link
          href={`/board/${p.id}`}
          className="flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[12px] font-semibold text-faint hover:text-soft"
        >
          <MessageCircle className="size-4" aria-hidden />
          {p.commentCount > 0 && p.commentCount}
        </Link>
      </div>
    </div>
  );
}

function TopicChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  const TopicIcon = TOPIC_STYLES[label]?.icon;
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors",
        active ? "bg-ink text-white" : "border border-line bg-surface text-soft hover:border-faint",
      )}
    >
      {TopicIcon && <TopicIcon className="size-3.5" aria-hidden />}
      {label}
    </button>
  );
}

function Composer({ eventId, onClose }: { eventId: string; onClose: () => void }) {
  const { member } = useAuth();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [link, setLink] = useState("");
  // Ideas, not BOARD_TOPICS[0] — Prayer Request leads the chip row but shouldn't
  // be what a post silently defaults to.
  const [topic, setTopic] = useState<string>("Ideas");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function pickImage(file: File) {
    setImageFile(file);
    setImagePreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
  }

  function clearImage() {
    setImageFile(null);
    setImagePreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!member) return;
    const cleanLink = normalizeLink(link);
    if (cleanLink === null) {
      setError("That link doesn't look right — use a full web address.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      let imageUrl: string | undefined;
      if (imageFile) {
        imageUrl = await uploadUserImage(member.uid, "idea", imageFile, crypto.randomUUID());
      }
      await createPost(member, { eventId, title, body, link: cleanLink, topic, imageUrl });
      onClose();
    } catch (err) {
      setError(
        err instanceof UploadError ? err.message : "Couldn't post — please try again.",
      );
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40" role="dialog" aria-modal="true" aria-label="New post">
      <div className="w-full max-w-lg rounded-t-3xl bg-paper p-5 pb-safe shadow-raised">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">Share with the community</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex size-9 items-center justify-center rounded-full text-soft hover:bg-line/50"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div className="flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none]">
            {BOARD_TOPICS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTopic(t)}
                aria-pressed={topic === t}
                className={cn(
                  "shrink-0 rounded-full px-3 py-1.5 text-[13px] font-semibold",
                  topic === t ? TOPIC_STYLES[t].chip : "border border-line bg-surface text-soft",
                )}
              >
                {t}
              </button>
            ))}
          </div>
          <Field label="Title">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              maxLength={100}
              placeholder="What's the idea, ask, or offer?"
            />
          </Field>
          <Field label="Details (optional)">
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={4}
              maxLength={1000}
              placeholder="A little more context…"
            />
          </Field>
          <Field label="Link (optional)">
            <Input
              value={link}
              onChange={(e) => setLink(e.target.value)}
              inputMode="url"
              placeholder="example.com/more-info"
            />
          </Field>
          <Field label="Image (optional)">
            {imagePreview ? (
              <div className="relative overflow-hidden rounded-xl">
                {/* eslint-disable-next-line @next/next/no-img-element -- local object URL preview */}
                <img src={imagePreview} alt="" className="h-40 w-full object-cover" />
                <button
                  type="button"
                  onClick={clearImage}
                  aria-label="Remove image"
                  className="absolute right-2 top-2 flex size-8 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur hover:bg-black/65"
                >
                  <X className="size-4" aria-hidden />
                </button>
              </div>
            ) : (
              <ImagePickerButton
                label="Add an image"
                onPick={pickImage}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-line bg-surface py-6 text-sm font-semibold text-soft hover:border-faint"
              >
                <ImagePlus className="size-4" aria-hidden />
                Add an image
              </ImagePickerButton>
            )}
          </Field>
          <Button type="submit" loading={saving} className="w-full" disabled={!title.trim()}>
            Post to the wall
          </Button>
          {error && <p className="text-sm text-danger">{error}</p>}
          <div className="pb-3" />
        </form>
      </div>
    </div>
  );
}

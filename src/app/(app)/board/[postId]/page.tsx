"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { collection, doc, onSnapshot, orderBy, query } from "firebase/firestore";
import { ArrowLeft, ExternalLink, Flag, Heart, Pencil, SendHorizontal, Trash2, X } from "lucide-react";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { addComment, deleteComment, deletePost, toggleReaction, updatePost } from "@/lib/board";
import { submitReport } from "@/lib/moderation";
import { BOARD_TOPICS, TOPIC_STYLES } from "@/lib/constants";
import type { Comment, Post } from "@/lib/types";
import { cn, normalizeLink, shortTime } from "@/lib/utils";
import { Avatar, Button, CoverBanner, Field, Input, LoadingScreen, Textarea } from "@/components/ui";

export default function PostDetailPage() {
  const { postId } = useParams<{ postId: string }>();
  const router = useRouter();
  const { user, member, isAdmin } = useAuth();
  const myUid = user!.uid;

  const [post, setPost] = useState<Post | null | undefined>(undefined);
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [reported, setReported] = useState(false);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    return onSnapshot(doc(db, "posts", postId), (snap) => {
      setPost(snap.exists() ? ({ id: snap.id, ...snap.data() } as Post) : null);
    });
  }, [postId]);

  useEffect(() => {
    const q = query(collection(db, "posts", postId, "comments"), orderBy("createdAt", "asc"));
    return onSnapshot(q, (snap) => {
      setComments(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Comment));
    });
  }, [postId]);

  if (post === undefined) return <LoadingScreen />;
  if (post === null) {
    return (
      <div className="px-6 py-16 text-center text-soft">
        <p>This post has been removed.</p>
        <Link href="/board" className="mt-2 inline-block font-semibold text-clay">
          Back to the board
        </Link>
      </div>
    );
  }

  const styles = TOPIC_STYLES[post.topic] ?? TOPIC_STYLES.Ideas;
  const reacted = post.reactedBy?.includes(myUid);
  const canDeletePost = isAdmin || post.authorId === myUid;
  // Only the author may edit content — the rules reject an admin content edit.
  const canEditPost = post.authorId === myUid;

  async function handleComment(e: FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || !member) return;
    setBusy(true);
    setDraft("");
    try {
      await addComment(postId, member, text);
    } catch {
      setDraft(text);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-[calc(100dvh-6rem)] flex-col">
      <div className="flex items-center justify-between px-2 py-2">
        <button
          onClick={() => router.back()}
          aria-label="Back"
          className="flex size-10 items-center justify-center rounded-full text-soft hover:bg-line/50"
        >
          <ArrowLeft className="size-5" aria-hidden />
        </button>
        <div className="flex items-center gap-1">
          <button
            onClick={async () => {
              await submitReport({
                targetType: "post",
                targetPath: `posts/${postId}`,
                excerpt: post!.title,
                reporterId: myUid,
              });
              setReported(true);
            }}
            disabled={reported}
            className="flex items-center gap-1.5 rounded-full px-3 py-2 text-[13px] font-semibold text-faint hover:text-danger disabled:opacity-60"
          >
            <Flag className="size-3.5" aria-hidden />
            {reported ? "Reported" : "Report"}
          </button>
          {canEditPost && (
            <button
              onClick={() => setEditing(true)}
              aria-label="Edit post"
              className="flex size-10 items-center justify-center rounded-full text-faint hover:text-clay"
            >
              <Pencil className="size-4" aria-hidden />
            </button>
          )}
          {canDeletePost && (
            <button
              onClick={async () => {
                if (!window.confirm("Delete this post for everyone?")) return;
                await deletePost(postId);
                router.replace("/board");
              }}
              aria-label="Delete post"
              className="flex size-10 items-center justify-center rounded-full text-faint hover:text-danger"
            >
              <Trash2 className="size-4" aria-hidden />
            </button>
          )}
        </div>
      </div>

      <article className="mx-4 overflow-hidden rounded-card bg-surface shadow-card">
        <div className={cn("h-1", styles.bar)} aria-hidden />
        <div className="p-5">
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
              styles.chip,
            )}
          >
            <styles.icon className="size-3" aria-hidden />
            {post.topic}
          </span>
          <h1 className="mt-2 text-xl font-bold leading-snug">{post.title}</h1>
          {post.body && (
            <p className="mt-2 whitespace-pre-wrap text-[15px] leading-relaxed text-soft">
              {post.body}
            </p>
          )}
          {post.imageUrl && (
            // Same cover-crop treatment as the wall/board cards so the image
            // reads at a consistent banner size instead of its full height.
            <CoverBanner
              seed={post.id}
              imageUrl={post.imageUrl}
              className="mt-4 h-44 rounded-xl"
            />
          )}
          {post.link && (
            <a
              href={post.link}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex items-center gap-1.5 break-all text-sm font-semibold text-clay underline-offset-2 hover:underline"
            >
              <ExternalLink className="size-4 shrink-0" aria-hidden />
              {post.link.replace(/^https?:\/\//, "")}
            </a>
          )}
          <div className="mt-4 flex items-center justify-between border-t border-line pt-3">
            <Link
              href={`/people/${post.authorId}`}
              className="text-[13px] font-semibold text-soft hover:text-ink"
            >
              {post.authorName} · {shortTime(post.createdAt)}
            </Link>
            <button
              onClick={() => toggleReaction(postId, myUid, !!reacted).catch(() => {})}
              aria-pressed={reacted}
              className={cn(
                "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold",
                reacted ? "bg-clay-soft text-clay" : "text-faint hover:text-soft",
              )}
            >
              <Heart className={cn("size-4", reacted && "fill-clay")} aria-hidden />
              {post.reactionCount}
            </button>
          </div>
        </div>
      </article>

      <section className="flex-1 px-4 pt-5" aria-label="Comments">
        <h2 className="text-[13px] font-bold uppercase tracking-wide text-faint">
          {comments?.length ?? 0} {comments?.length === 1 ? "comment" : "comments"}
        </h2>
        <ul className="mt-3 space-y-3 pb-4">
          {comments?.map((c) => (
            <li key={c.id} className="flex gap-2.5">
              <Avatar name={c.authorName} uid={c.authorId} size="sm" />
              <div className="min-w-0 flex-1 rounded-2xl rounded-tl-md bg-surface px-3.5 py-2.5 shadow-card">
                <div className="flex items-baseline justify-between gap-2">
                  <Link
                    href={`/people/${c.authorId}`}
                    className="truncate text-[13px] font-bold hover:text-clay"
                  >
                    {c.authorName}
                  </Link>
                  <span className="shrink-0 text-[11px] text-faint">{shortTime(c.createdAt)}</span>
                </div>
                <p className="mt-0.5 whitespace-pre-wrap text-[14px] leading-relaxed">{c.text}</p>
                <div className="mt-1 flex justify-end gap-2">
                  <button
                    onClick={() =>
                      submitReport({
                        targetType: "comment",
                        targetPath: `posts/${postId}/comments/${c.id}`,
                        excerpt: c.text,
                        reporterId: myUid,
                      })
                    }
                    aria-label="Report comment"
                    className="text-faint hover:text-danger"
                  >
                    <Flag className="size-3.5" aria-hidden />
                  </button>
                  {(isAdmin || c.authorId === myUid) && (
                    <button
                      onClick={() => deleteComment(postId, c.id)}
                      aria-label="Delete comment"
                      className="text-faint hover:text-danger"
                    >
                      <Trash2 className="size-3.5" aria-hidden />
                    </button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <form
        onSubmit={handleComment}
        className="sticky bottom-24 mx-4 flex items-end gap-2 rounded-3xl border border-line bg-surface p-1.5 shadow-raised"
      >
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={1}
          placeholder="Add a comment…"
          aria-label="Add a comment"
          className="max-h-28 min-h-10 flex-1 resize-none bg-transparent px-3 py-2 text-[15px] focus:outline-none"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
          }}
        />
        <button
          type="submit"
          disabled={!draft.trim() || busy}
          aria-label="Send comment"
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-clay text-white disabled:bg-clay/30"
        >
          <SendHorizontal className="size-4" aria-hidden />
        </button>
      </form>

      {editing && (
        <EditPost post={post} onClose={() => setEditing(false)} />
      )}
    </div>
  );
}

/* --------------------------------- Edit ----------------------------------- */
/* Author-only sheet to revise a post — retopic it or tweak the text. Mirrors
   the board Composer's look; image stays as-is (edit it by reposting). */

function EditPost({ post, onClose }: { post: Post; onClose: () => void }) {
  const [title, setTitle] = useState(post.title);
  const [body, setBody] = useState(post.body);
  const [link, setLink] = useState(post.link);
  const [topic, setTopic] = useState(post.topic);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const cleanLink = normalizeLink(link);
    if (cleanLink === null) {
      setError("That link doesn't look right — use a full web address.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await updatePost(post.id, { title, body, link: cleanLink, topic });
      onClose();
    } catch {
      setError("Couldn't save changes — please try again.");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40" role="dialog" aria-modal="true" aria-label="Edit post">
      <div className="w-full max-w-lg rounded-t-3xl bg-paper p-5 pb-safe shadow-raised">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">Edit your post</h2>
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
          <Button type="submit" loading={saving} className="w-full" disabled={!title.trim()}>
            Save changes
          </Button>
          {error && <p className="text-sm text-danger">{error}</p>}
          <div className="pb-3" />
        </form>
      </div>
    </div>
  );
}

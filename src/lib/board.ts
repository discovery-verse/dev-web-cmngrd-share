"use client";

import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  increment,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Member } from "@/lib/types";

export function createPost(
  author: Member,
  input: { eventId: string; title: string; body: string; link: string; topic: string; imageUrl?: string },
) {
  return addDoc(collection(db, "posts"), {
    eventId: input.eventId,
    authorId: author.uid,
    authorName: author.name,
    title: input.title.trim(),
    body: input.body.trim(),
    link: input.link,
    topic: input.topic,
    // Only write the key when set — the rules accept an absent imageUrl.
    ...(input.imageUrl ? { imageUrl: input.imageUrl } : {}),
    reactedBy: [],
    reactionCount: 0,
    commentCount: 0,
    createdAt: serverTimestamp(),
  });
}

/**
 * Edit a post's content. Only the author may do this (enforced in
 * firestore.rules); the counters, author, and eventId are left untouched.
 * imageUrl is omitted so an existing cover is preserved.
 */
export function updatePost(
  postId: string,
  input: { title: string; body: string; link: string; topic: string },
) {
  return updateDoc(doc(db, "posts", postId), {
    title: input.title.trim(),
    body: input.body.trim(),
    link: input.link,
    topic: input.topic,
  });
}

/**
 * Toggle my reaction. `reactionCount` must equal the final reactedBy length —
 * the security rules verify this and that only my own uid was added/removed.
 */
export function toggleReaction(postId: string, myUid: string, hasReacted: boolean) {
  return updateDoc(doc(db, "posts", postId), {
    reactedBy: hasReacted ? arrayRemove(myUid) : arrayUnion(myUid),
    reactionCount: increment(hasReacted ? -1 : 1),
  });
}

export function addComment(postId: string, author: Member, text: string) {
  const batch = [
    addDoc(collection(db, "posts", postId, "comments"), {
      authorId: author.uid,
      authorName: author.name,
      text: text.trim(),
      createdAt: serverTimestamp(),
    }),
    updateDoc(doc(db, "posts", postId), { commentCount: increment(1) }),
  ];
  return Promise.all(batch);
}

export function deleteComment(postId: string, commentId: string) {
  return Promise.all([
    deleteDoc(doc(db, "posts", postId, "comments", commentId)),
    updateDoc(doc(db, "posts", postId), { commentCount: increment(-1) }),
  ]);
}

export function deletePost(postId: string) {
  // Orphaned comments/reactions under a deleted post are unreadable in the UI
  // and cleaned up lazily; acceptable for v1 scale.
  return deleteDoc(doc(db, "posts", postId));
}

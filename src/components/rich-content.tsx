"use client";

import { useMemo } from "react";
import { Marked } from "marked";
import DOMPurify from "dompurify";
import { cn } from "@/lib/utils";

/**
 * Renders admin-authored event info. The stored value is Markdown, but Markdown
 * passes inline HTML straight through — so "paste raw HTML" and "quick-insert
 * structured blocks" both flow through this one path. GitHub-flavoured Markdown
 * gives us tables + task lists; `breaks` makes single newlines behave like the
 * plain-text address blocks admins tend to paste.
 */
const marked = new Marked({ gfm: true, breaks: true });

// DOMPurify hooks are global; register the "open links in a new tab" one once.
let linkHookAdded = false;
function ensureLinkHook() {
  if (linkHookAdded || typeof window === "undefined") return;
  DOMPurify.addHook("afterSanitizeAttributes", (node) => {
    if (node.nodeName === "A" && node.getAttribute("href")) {
      node.setAttribute("target", "_blank");
      node.setAttribute("rel", "noopener noreferrer");
    }
  });
  linkHookAdded = true;
}

/**
 * Safely render Markdown/HTML content. Everything is sanitized with DOMPurify
 * before it hits the DOM, so even trusted admin input can't inject scripts or
 * event handlers. Sanitizing needs a real DOM, so it only runs in the browser —
 * fine here since the content is always loaded client-side from Firestore.
 */
export function RichContent({ content, className }: { content: string; className?: string }) {
  const html = useMemo(() => {
    if (typeof window === "undefined" || !content) return "";
    ensureLinkHook();
    const raw = marked.parse(content, { async: false }) as string;
    // Wrap tables so wide ones scroll inside their own box (page never does).
    const wrapped = raw
      .replace(/<table>/g, '<div class="table-wrap"><table>')
      .replace(/<\/table>/g, "</table></div>");
    return DOMPurify.sanitize(wrapped, { ADD_ATTR: ["target"] });
  }, [content]);

  if (!content?.trim()) return null;

  return (
    <div
      className={cn("rich", className)}
      // Sanitized above with DOMPurify.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

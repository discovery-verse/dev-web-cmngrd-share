import { NextRequest, NextResponse } from "next/server";
import { uploadAdminImage } from "@/lib/server/admin";
import { errorResponse, requireAdmin } from "@/lib/server/auth";
import type { EventImportDTO } from "@/lib/api-types";

const FETCH_TIMEOUT_MS = 10_000;
const USER_AGENT = "Mozilla/5.0 (compatible; CommonGroundBot/1.0; +https://commonground.app)";
const IMAGE_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

/**
 * Pull prefill data (name, cover image, canonical link) out of a pasted event
 * page's Open Graph tags — works for Luma and most other event platforms,
 * since they all publish og:title/og:image/og:url for link previews.
 */
export async function POST(req: NextRequest) {
  try {
    await requireAdmin(req);
    const body = (await req.json()) as { url?: string };
    const pageUrl = assertPublicHttpsUrl(body.url ?? "");

    const res = await fetch(pageUrl, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`Couldn't load that page (${res.status}).`);
    const html = await res.text();

    const og = extractOgTags(html);
    const name = cleanTitle(og["og:title"]);
    if (!name) throw new Error("Couldn't find an event name on that page — try entering details manually.");

    const eventUrl = og["og:url"] || pageUrl.href;
    const coverUrl = og["og:image"] ? await tryRehostImage(og["og:image"]) : "";

    const result: EventImportDTO = { name, eventUrl, signupUrl: eventUrl, coverUrl };
    return NextResponse.json({ import: result });
  } catch (e) {
    return errorResponse(e);
  }
}

/** Reject anything but public https URLs — this fetches server-side on an admin's say-so. */
function assertPublicHttpsUrl(raw: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(/^https?:\/\//i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`);
  } catch {
    throw new Error("That doesn't look like a valid URL.");
  }
  if (parsed.protocol !== "https:") throw new Error("Please use an https:// link.");
  const host = parsed.hostname.toLowerCase();
  const isPrivate =
    host === "localhost" ||
    host === "metadata.google.internal" ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host);
  if (isPrivate) throw new Error("That URL isn't allowed.");
  return parsed;
}

function extractOgTags(html: string): Record<string, string> {
  const tags: Record<string, string> = {};
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const prop = tag.match(/(?:property|name)=["']([^"']+)["']/i)?.[1];
    const content = tag.match(/content=["']([^"']*)["']/i)?.[1];
    if (prop && content !== undefined) tags[prop] = decodeEntities(content);
  }
  return tags;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'");
}

/** Luma (and similar) titles look like "Event Name · Luma" — strip the site suffix. */
function cleanTitle(raw: string | undefined): string {
  if (!raw) return "";
  return raw.replace(/\s*[·|]\s*Luma\s*$/i, "").trim();
}

/** Best-effort: copy the og:image into our own media library instead of hotlinking a third party. */
async function tryRehostImage(imageUrl: string): Promise<string> {
  try {
    const parsed = assertPublicHttpsUrl(imageUrl);
    const res = await fetch(parsed, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) return "";
    const contentType = res.headers.get("content-type")?.split(";")[0]?.trim() ?? "";
    const ext = IMAGE_EXT[contentType];
    if (!ext) return "";
    const buffer = Buffer.from(await res.arrayBuffer());
    const { url } = await uploadAdminImage(buffer, contentType, { folder: "events", ext });
    return url;
  } catch {
    return "";
  }
}

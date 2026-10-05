"use client";

import { useRef, useState } from "react";
import { Check, Copy, ImagePlus, Trash2 } from "lucide-react";
import { api, apiUpload, useApiData } from "@/lib/admin-api";
import { prepareImage, UploadError } from "@/lib/upload";
import type { MediaDTO } from "@/lib/api-types";
import { Button, EmptyState, LoadingScreen, PageHeader } from "@/components/admin/ui";

export default function MediaPage() {
  const { data, error, reload } = useApiData(async () =>
    api<{ media: MediaDTO[] }>("/api/admin/media"),
  );
  const media = data?.media ?? null;

  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setUploadError(null);
    try {
      // Downscale each in the browser, then hand the small blob to the server.
      for (const file of Array.from(files)) {
        const blob = await prepareImage(file, "cover");
        const form = new FormData();
        const ext = blob.type === "image/gif" ? "gif" : "jpg";
        form.append("file", blob, file.name.replace(/\.[^.]+$/, "") + "." + ext);
        form.append("name", file.name);
        await apiUpload<{ media: MediaDTO }>("/api/admin/media", form);
      }
      await reload();
    } catch (err) {
      setUploadError(
        err instanceof UploadError ? err.message : "Upload failed — please try again.",
      );
    } finally {
      setUploading(false);
    }
  }

  async function remove(item: MediaDTO) {
    if (!window.confirm(`Delete "${item.name}"? Anything still pointing at this URL will break.`)) {
      return;
    }
    await api(`/api/admin/media/${item.id}`, { method: "DELETE" });
    await reload();
  }

  if (error) return <p className="text-sm text-danger">{error}</p>;
  if (!media) return <LoadingScreen />;

  return (
    <div>
      <PageHeader
        title="Media"
        subtitle="Upload once, reuse the URL anywhere — room covers, event art, and more."
        action={
          <Button onClick={() => inputRef.current?.click()} loading={uploading}>
            <ImagePlus className="size-4" aria-hidden /> Upload
          </Button>
        }
      />
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        multiple
        className="hidden"
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = "";
        }}
      />

      {uploadError && <p className="mb-4 text-sm text-danger">{uploadError}</p>}

      {media.length === 0 ? (
        <EmptyState
          title="No media yet"
          body="Upload an image to host it here, then copy its URL to use across the app."
        />
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {media.map((item) => (
            <MediaCard key={item.id} item={item} onDelete={() => remove(item)} />
          ))}
        </div>
      )}
    </div>
  );
}

function MediaCard({ item, onDelete }: { item: MediaDTO; onDelete: () => void }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(item.url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked (e.g. insecure context) — select-and-copy fallback.
      window.prompt("Copy this URL:", item.url);
    }
  }

  return (
    <div className="overflow-hidden rounded-card border border-line bg-surface">
      <div className="aspect-video bg-line/40">
        {/* eslint-disable-next-line @next/next/no-img-element -- Storage-hosted media */}
        <img src={item.url} alt={item.name} loading="lazy" className="size-full object-cover" />
      </div>
      <div className="flex items-center gap-2 p-2.5">
        <p className="min-w-0 flex-1 truncate text-[13px] font-medium" title={item.name}>
          {item.name}
        </p>
        <button
          onClick={copy}
          aria-label="Copy URL"
          title="Copy URL"
          className="flex size-8 shrink-0 items-center justify-center rounded-full text-faint hover:bg-line/40 hover:text-ink"
        >
          {copied ? <Check className="size-4 text-sage" aria-hidden /> : <Copy className="size-4" aria-hidden />}
        </button>
        <button
          onClick={onDelete}
          aria-label={`Delete ${item.name}`}
          className="flex size-8 shrink-0 items-center justify-center rounded-full text-faint hover:bg-danger-soft hover:text-danger"
        >
          <Trash2 className="size-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}

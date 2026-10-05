"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { auth } from "@/lib/firebase";

/**
 * Fetch wrapper for the /api/admin routes. Attaches the current user's Firebase
 * ID token as a bearer credential (the server verifies it + the admins doc).
 * On 401 it bounces to /higherground (the console's login).
 */
export async function api<T>(
  path: string,
  opts: { method?: string; body?: unknown } = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  const user = auth.currentUser;
  if (user) headers.Authorization = `Bearer ${await user.getIdToken()}`;
  if (opts.body) headers["Content-Type"] = "application/json";

  const res = await fetch(path, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });

  if (res.status === 401 && typeof window !== "undefined") {
    window.location.href = "/higherground";
    throw new Error("Not signed in");
  }

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) {
    throw new Error(data?.error || `Request failed (${res.status})`);
  }
  return data as T;
}

/**
 * Like `api`, but posts multipart/form-data (file uploads). Don't set
 * Content-Type — the browser adds the multipart boundary itself.
 */
export async function apiUpload<T>(path: string, form: FormData): Promise<T> {
  const headers: Record<string, string> = {};
  const user = auth.currentUser;
  if (user) headers.Authorization = `Bearer ${await user.getIdToken()}`;

  const res = await fetch(path, { method: "POST", headers, body: form });

  if (res.status === 401 && typeof window !== "undefined") {
    window.location.href = "/higherground";
    throw new Error("Not signed in");
  }

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new Error(data?.error || `Request failed (${res.status})`);
  }
  return data as T;
}

/**
 * Load data on mount via `loader`, exposing { data, error, reload }. Centralises
 * the fetch-in-effect pattern (and the one lint exception it needs) so pages
 * stay clean. `reload` re-runs the loader after mutations.
 */
export function useApiData<T>(loader: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loaderRef = useRef(loader);
  useEffect(() => {
    loaderRef.current = loader;
  });

  const reload = useCallback(async () => {
    try {
      setData(await loaderRef.current());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return { data, error, reload };
}

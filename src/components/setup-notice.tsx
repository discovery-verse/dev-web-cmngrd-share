import { Settings } from "lucide-react";

/**
 * Rendered instead of the app when NEXT_PUBLIC_FIREBASE_* env vars are
 * missing from the build — a clear next step rather than a client crash.
 */
export function SetupNotice() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6">
      <div className="rounded-card bg-surface p-6 shadow-card">
        <Settings className="mb-3 size-8 text-clay" aria-hidden />
        <h1 className="text-xl font-bold">Almost there — connect Firebase</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-soft">
          This build has no Firebase configuration, so sign-in and data are
          disabled.
        </p>
        <ol className="mt-4 list-decimal space-y-2 pl-5 text-[14px] leading-relaxed text-soft">
          <li>
            Copy <code className="rounded bg-paper px-1 font-mono text-[13px]">.env.local.example</code>{" "}
            to <code className="rounded bg-paper px-1 font-mono text-[13px]">.env.local</code> and fill in
            your Firebase web-app values.
          </li>
          <li>
            Rebuild and restart:{" "}
            <code className="rounded bg-paper px-1 font-mono text-[13px]">npm run build && npm start</code>
          </li>
          <li>Deploy the Firestore rules and run the seed script (see README).</li>
        </ol>
      </div>
    </main>
  );
}

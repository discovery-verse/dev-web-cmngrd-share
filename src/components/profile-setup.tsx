"use client";

import { useState, type FormEvent } from "react";
import { ArrowLeft, Camera, Check } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { EVENT_KEY } from "@/lib/event-context";
import { GROUP_LABELS, MAX_ABOUT, MAX_INTERESTS, MAX_LOCATION, SELF_SERVE_GROUPS, type MemberGroup, type ProfileLink } from "@/lib/types";
import { cn } from "@/lib/utils";
import { uploadUserImage, UploadError } from "@/lib/upload";
import { Avatar, Button, CoverBanner, Field, ImagePickerButton, Input, Textarea } from "@/components/ui";
import { LinksEditor } from "@/components/links-editor";

/**
 * First-run onboarding after magic-link sign-in.
 * Public fields (name/title/company/group) go to members/{uid}.
 * Contact fields go to members/{uid}/private/contact — a separate document so
 * Firestore rules can gate them behind an accepted connection. They are never
 * written to the public profile doc.
 *
 * Profile photo and cover are uploaded to Cloud Storage the moment they're
 * picked (the storage path only needs the uid, which exists before the member
 * doc does); their download URLs ride along in the onboarding POST so the
 * server can stamp them onto the freshly-created profile.
 */
export function ProfileSetup() {
  const { user, signOut } = useAuth();
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [company, setCompany] = useState("");
  const [location, setLocation] = useState("");
  const [about, setAbout] = useState("");
  const [interests, setInterests] = useState("");
  const [groups, setGroups] = useState<MemberGroup[]>([]);
  const [phone, setPhone] = useState("");
  const [linkedin, setLinkedin] = useState("");
  const [links, setLinks] = useState<ProfileLink[]>([]);
  const [photoUrl, setPhotoUrl] = useState<string | undefined>();
  const [coverUrl, setCoverUrl] = useState<string | undefined>();
  const [imageBusy, setImageBusy] = useState<"avatar" | "cover" | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user) return null;

  function toggleGroup(g: MemberGroup) {
    setGroups((prev) => (prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]));
  }

  // Upload the picked image now and hold its download URL in local state; it's
  // persisted to the member doc when the profile is created on submit.
  async function handleImage(kind: "avatar" | "cover", file: File) {
    if (!user) return;
    setImageBusy(kind);
    setImageError(null);
    try {
      const url = await uploadUserImage(user.uid, kind, file);
      if (kind === "avatar") setPhotoUrl(url);
      else setCoverUrl(url);
    } catch (err) {
      setImageError(err instanceof UploadError ? err.message : "Upload failed — please try again.");
    } finally {
      setImageBusy(null);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!user || groups.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      // Onboarding goes through the server so the per-event "Allow sign-ups"
      // gate is enforced (and can't be bypassed). The event the visitor
      // arrived through was stashed by the per-event sign-in link.
      const eventId = window.localStorage.getItem(EVENT_KEY) ?? undefined;
      const token = await user.getIdToken();
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: name.trim(),
          title: title.trim(),
          company: company.trim(),
          location: location.trim(),
          about: about.trim(),
          interests: interests.trim(),
          groups,
          phone: phone.trim(),
          linkedin: linkedin.trim(),
          links: links.filter((l) => l.url.trim()),
          photoUrl,
          coverUrl,
          eventId,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error || "Couldn't save your profile — please try again.");
      }
      // AuthProvider's snapshot listener picks up the new profile and swaps
      // the onboarding screen for the app automatically.
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save your profile — please try again.");
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-md px-6 pb-16 pt-safe">
      <button
        type="button"
        onClick={() => signOut()}
        disabled={saving}
        className="mt-8 -ml-1 inline-flex items-center gap-1 text-sm font-semibold text-soft transition-colors hover:text-clay disabled:opacity-50"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Back
      </button>
      <div className="pb-6 pt-4">
        <h1 className="text-2xl font-bold tracking-tight">Welcome 👋</h1>
        <p className="mt-1 text-[15px] leading-relaxed text-soft">
          Tell the community who you are. Your name, title, and company are
          visible to members — your contact details stay private until you
          accept a connection.
        </p>
      </div>

      {/* Photo + cover — uploaded on pick; persisted when you join below. */}
      <div className="mb-4 overflow-hidden rounded-card bg-surface shadow-card">
        <CoverBanner seed={user.uid} imageUrl={coverUrl} className="h-20">
          <ImagePickerButton
            label="Add cover photo"
            busy={imageBusy === "cover"}
            onPick={(file) => handleImage("cover", file)}
            className="absolute right-2 top-2 z-10 flex size-8 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur hover:bg-black/55"
          >
            <Camera className="size-4" aria-hidden />
          </ImagePickerButton>
        </CoverBanner>
        <div className="flex items-center gap-4 p-5 pt-0">
          <div className="relative z-10 -mt-7">
            <Avatar name={name || "?"} uid={user.uid} src={photoUrl} size="lg" className="ring-4 ring-surface" />
            <ImagePickerButton
              label="Add profile photo"
              busy={imageBusy === "avatar"}
              onPick={(file) => handleImage("avatar", file)}
              className="absolute -bottom-1 -right-1 flex size-7 items-center justify-center rounded-full bg-clay text-white ring-2 ring-surface hover:bg-clay-deep"
            >
              <Camera className="size-3.5" aria-hidden />
            </ImagePickerButton>
          </div>
          <p className="pt-1 text-[13px] leading-relaxed text-soft">
            Add a profile photo and cover banner <span className="text-faint">(optional)</span>.
          </p>
        </div>
        {imageError && <p className="px-5 pb-3 text-sm text-danger">{imageError}</p>}
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Full name">
          <Input value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" />
        </Field>
        <Field label="Title / role">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="e.g. CEO, Executive Director" />
        </Field>
        <Field label="Company / organisation">
          <Input value={company} onChange={(e) => setCompany(e.target.value)} required autoComplete="organization" />
        </Field>
        <Field label="Location">
          <Input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            maxLength={MAX_LOCATION}
            placeholder="Where are you based? (City / Country / Region)"
          />
        </Field>
        <Field label="About you">
          <Textarea
            value={about}
            onChange={(e) => setAbout(e.target.value)}
            maxLength={MAX_ABOUT}
            rows={5}
            placeholder="Share a little about yourself so others can get to know you and your journey.

e.g. Former long-time KPMG consultant turned AI startup founder, now an investor. Passionate about seeing God's kingdom influence the tech and finance space. Dad of two, recently obsessed with pickleball and Claude co-working (token-maxxing!)."
          />
        </Field>
        <Field label="Your interests & redemptive burden (optional)">
          <Textarea
            value={interests}
            onChange={(e) => setInterests(e.target.value)}
            maxLength={MAX_INTERESTS}
            rows={4}
            placeholder="What are some areas you care deeply about, challenges or redemptive opportunities in your faith and work?

e.g. I'm interested in exploring how technology and finance can be used redemptively, and supporting initiatives that serve vulnerable families and youth across Southeast Asia."
          />
        </Field>

        <fieldset className="space-y-1.5">
          <legend className="text-[13px] font-semibold text-soft">
            I&apos;m best described as… <span className="font-normal text-faint">(select all that apply)</span>
          </legend>
          <div className="grid gap-2">
            {SELF_SERVE_GROUPS.map((g) => {
              const checked = groups.includes(g);
              return (
                <button
                  key={g}
                  type="button"
                  role="checkbox"
                  aria-checked={checked}
                  onClick={() => toggleGroup(g)}
                  className={cn(
                    "flex items-center gap-3 rounded-xl border px-4 py-3 text-left text-[15px] font-medium transition-colors",
                    checked
                      ? "border-clay bg-clay-soft text-clay-deep"
                      : "border-line bg-surface text-ink hover:border-faint",
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "flex size-5 shrink-0 items-center justify-center rounded-md border transition-colors",
                      checked ? "border-clay bg-clay text-white" : "border-faint bg-surface",
                    )}
                  >
                    {checked && <Check className="size-3.5" aria-hidden />}
                  </span>
                  {GROUP_LABELS[g]}
                </button>
              );
            })}
          </div>
        </fieldset>

        <div className="rounded-card bg-sage-soft/60 p-4">
          <p className="text-[13px] font-semibold text-sage">
            Private — only shared with connections you accept
          </p>
          <div className="mt-3 space-y-3">
            <Field label="Email">
              <Input value={user.email ?? ""} disabled className="opacity-70" />
            </Field>
            <Field label="Phone (optional)">
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="+65 …"
              />
            </Field>
            <Field label="LinkedIn (optional)">
              <Input
                value={linkedin}
                onChange={(e) => setLinkedin(e.target.value)}
                placeholder="linkedin.com/in/…"
              />
            </Field>
            <div className="space-y-1.5">
              <p className="text-[13px] font-semibold text-soft">
                Links <span className="font-normal text-faint">(optional — website, projects, socials)</span>
              </p>
              <LinksEditor links={links} onChange={setLinks} />
            </div>
          </div>
        </div>

        <Button type="submit" loading={saving} disabled={groups.length === 0} className="w-full">
          Join the community
        </Button>
        {error && <p className="text-sm text-danger">{error}</p>}
      </form>
    </main>
  );
}

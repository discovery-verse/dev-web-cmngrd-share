"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { doc, onSnapshot, serverTimestamp, updateDoc, writeBatch } from "firebase/firestore";
import { Camera, Check, LogOut, ShieldCheck } from "lucide-react";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { GROUP_LABELS, MAX_ABOUT, MAX_INTERESTS, MAX_LOCATION, normalizeLinks, SELF_SERVE_GROUPS, type ContactCard, type MemberGroup, type ProfileLink } from "@/lib/types";
import { cn } from "@/lib/utils";
import { uploadUserImage, UploadError, type ImageKind } from "@/lib/upload";
import { Avatar, Button, CoverBanner, Field, ImagePickerButton, Input, PageHeader, Textarea } from "@/components/ui";
import { LinksEditor } from "@/components/links-editor";

export default function MePage() {
  const { user, member, isAdmin, signOut } = useAuth();
  const myUid = user!.uid;

  const [name, setName] = useState(member?.name ?? "");
  const [title, setTitle] = useState(member?.title ?? "");
  const [company, setCompany] = useState(member?.company ?? "");
  const [location, setLocation] = useState(member?.location ?? "");
  const [about, setAbout] = useState(member?.about ?? "");
  const [interests, setInterests] = useState(member?.interests ?? "");
  const [groups, setGroups] = useState<MemberGroup[]>(member?.groups ?? []);
  const [phone, setPhone] = useState("");
  const [linkedin, setLinkedin] = useState("");
  const [links, setLinks] = useState<ProfileLink[]>([]);
  const [contactLoaded, setContactLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageBusy, setImageBusy] = useState<ImageKind | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);

  useEffect(() => {
    return onSnapshot(doc(db, "members", myUid, "private", "contact"), (snap) => {
      if (!contactLoaded && snap.exists()) {
        const c = snap.data() as ContactCard;
        setPhone(c.phone ?? "");
        setLinkedin(c.linkedin ?? "");
        setLinks(normalizeLinks(c.links));
      }
      setContactLoaded(true);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myUid]);

  function toggleGroup(g: MemberGroup) {
    setGroups((prev) => (prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]));
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, "members", myUid), {
        name: name.trim(),
        title: title.trim(),
        company: company.trim(),
        location: location.trim(),
        about: about.trim(),
        interests: interests.trim(),
        groups,
        nameLower: name.trim().toLowerCase(),
        companyLower: company.trim().toLowerCase(),
        updatedAt: serverTimestamp(),
      });
      batch.set(doc(db, "members", myUid, "private", "contact"), {
        email: user?.email ?? "",
        phone: phone.trim(),
        linkedin: linkedin.trim(),
        links: normalizeLinks(links),
      });
      await batch.commit();
      setSaved(true);
    } catch (err) {
      console.error("profile save failed", err);
      setError("Couldn't save — please try again.");
    } finally {
      setSaving(false);
    }
  }

  // Avatar ('avatar' → photoUrl) and cover ('cover' → coverUrl) share one
  // handler: upload the downscaled image, then point the member doc at it.
  async function handleImage(kind: "avatar" | "cover", file: File) {
    setImageBusy(kind);
    setImageError(null);
    try {
      const url = await uploadUserImage(myUid, kind, file);
      await updateDoc(doc(db, "members", myUid), {
        [kind === "avatar" ? "photoUrl" : "coverUrl"]: url,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      console.error("image upload failed", err);
      setImageError(
        err instanceof UploadError ? err.message : "Upload failed — please try again.",
      );
    } finally {
      setImageBusy(null);
    }
  }

  if (!member) return null;

  return (
    <div>
      <PageHeader title="My profile" />

      <div className="mx-4 overflow-hidden rounded-card bg-surface shadow-card">
        <CoverBanner seed={myUid} imageUrl={member.coverUrl} className="h-20">
          <ImagePickerButton
            label="Change cover photo"
            busy={imageBusy === "cover"}
            onPick={(file) => handleImage("cover", file)}
            className="absolute right-2 top-2 z-10 flex size-8 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur hover:bg-black/55"
          >
            <Camera className="size-4" aria-hidden />
          </ImagePickerButton>
        </CoverBanner>
        <div className="flex items-center gap-4 p-5 pt-0">
          <div className="relative z-10 -mt-7">
            <Avatar name={member.name} uid={myUid} src={member.photoUrl} size="lg" className="ring-4 ring-surface" />
            <ImagePickerButton
              label="Change profile photo"
              busy={imageBusy === "avatar"}
              onPick={(file) => handleImage("avatar", file)}
              className="absolute -bottom-1 -right-1 flex size-7 items-center justify-center rounded-full bg-clay text-white ring-2 ring-surface hover:bg-clay-deep"
            >
              <Camera className="size-3.5" aria-hidden />
            </ImagePickerButton>
          </div>
          <div className="min-w-0 pt-1">
            <p className="text-lg font-bold">{member.name}</p>
            <p className="text-sm text-soft">{user?.email}</p>
          </div>
        </div>
        {imageError && <p className="px-5 pb-3 text-sm text-danger">{imageError}</p>}
      </div>

      <p className="mx-4 mt-2 text-[12px] leading-relaxed text-faint">
        Cover photo looks best at <span className="font-semibold">1584 × 396 px</span> (4:1) —
        the same size as a LinkedIn banner.
      </p>

      {isAdmin && (
        <Link
          href="/admin"
          className="mx-4 mt-3 flex items-center gap-3 rounded-card bg-sage-soft p-4 font-semibold text-sage"
        >
          <ShieldCheck className="size-5" aria-hidden />
          Admin — reports & rooms
        </Link>
      )}

      <form onSubmit={handleSave} className="space-y-4 px-4 py-5">
        <h2 className="text-[13px] font-bold uppercase tracking-wide text-faint">
          Visible to all members
        </h2>
        <Field label="Full name">
          <Input value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>
        <Field label="Title / role">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} required />
        </Field>
        <Field label="Company / organisation">
          <Input value={company} onChange={(e) => setCompany(e.target.value)} required />
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
        <div className="space-y-1.5">
          <p className="text-[13px] font-semibold text-soft">
            I&apos;m best described as… <span className="font-normal text-faint">(select all that apply)</span>
          </p>
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
                      : "border-line bg-surface hover:border-faint",
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
        </div>

        <h2 className="pt-2 text-[13px] font-bold uppercase tracking-wide text-faint">
          Private — shared only with accepted connections
        </h2>
        <Field label="Phone">
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" inputMode="tel" />
        </Field>
        <Field label="LinkedIn">
          <Input value={linkedin} onChange={(e) => setLinkedin(e.target.value)} placeholder="linkedin.com/in/…" />
        </Field>
        <div className="space-y-1.5">
          <p className="text-[13px] font-semibold text-soft">
            Links <span className="font-normal text-faint">(website, projects, socials)</span>
          </p>
          <LinksEditor links={links} onChange={setLinks} />
        </div>

        <Button type="submit" loading={saving} className="w-full">
          Save changes
        </Button>
        {saved && <p className="text-center text-sm font-semibold text-sage">Saved ✓</p>}
        {error && <p className="text-center text-sm text-danger">{error}</p>}
      </form>

      <div className="px-4 pb-8">
        <button
          onClick={() => signOut()}
          className="mx-auto flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-faint hover:text-danger"
        >
          <LogOut className="size-4" aria-hidden />
          Sign out
        </button>
      </div>
    </div>
  );
}

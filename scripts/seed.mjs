#!/usr/bin/env node
/**
 * One-time setup / ops script (run with: npm run seed -- [flags])
 *
 *   node scripts/seed.mjs                      → ensures config/app + events exist
 *   node scripts/seed.mjs --admin <uid>        → grant admin to a member uid
 *   node scripts/seed.mjs --dm-connections on  → DMs restricted to connections
 *   node scripts/seed.mjs --dm-connections off → DMs open to all members
 *   node scripts/seed.mjs --rooms              → create a few starter rooms (in summit)
 *   node scripts/seed.mjs --backfill-hidden    → stamp hidden: false on pre-feature rooms
 *   node scripts/seed.mjs --approve <uid> <eventId>  → approve a member for an event
 *                                                      (summit | community | circle)
 *
 * Requires GOOGLE_APPLICATION_CREDENTIALS pointing at a service-account key
 * (or run inside an environment with default credentials).
 *
 * FIRESTORE_DATABASE_ID selects a named database instead of the project's
 * (default) database. Leave it unset unless this app shares a Firebase
 * project with another app.
 */
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const DATABASE_ID = process.env.FIRESTORE_DATABASE_ID || "(default)";
initializeApp({ credential: applicationDefault() });
const db = getFirestore(DATABASE_ID);

const args = process.argv.slice(2);

function flagValue(name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

// Always make sure the config doc exists — the security rules read it to
// decide DM scope, so a missing doc would block thread creation entirely.
const configRef = db.doc("config/app");
const configSnap = await configRef.get();
if (!configSnap.exists) {
  await configRef.set({ dmRequiresConnection: false });
  console.log("created config/app (dmRequiresConnection: false)");
}

// Ensure the three events exist (idempotent).
const EVENTS = [
  ["summit", "Annual Community Summit", "Summit", 1],
  ["community", "Community", "Community", 2],
  ["circle", "Members Circle", "Circle", 3],
];
for (const [id, name, shortName, order] of EVENTS) {
  const ref = db.doc(`events/${id}`);
  if (!(await ref.get()).exists) {
    await ref.set({ name, shortName, order });
    console.log(`created event ${id} (${name})`);
  }
}

const adminUid = flagValue("--admin");
if (adminUid) {
  await db.doc(`admins/${adminUid}`).set({ grantedAt: FieldValue.serverTimestamp() });
  console.log(`granted admin to ${adminUid}`);
}

const dmScope = flagValue("--dm-connections");
if (dmScope === "on" || dmScope === "off") {
  await configRef.set({ dmRequiresConnection: dmScope === "on" }, { merge: true });
  console.log(`dmRequiresConnection → ${dmScope === "on"}`);
}

const approveUid = flagValue("--approve");
if (approveUid) {
  const eventId = args[args.indexOf("--approve") + 2];
  if (!EVENTS.some(([id]) => id === eventId)) {
    console.error(`usage: --approve <uid> <${EVENTS.map(([id]) => id).join("|")}>`);
    process.exit(1);
  }
  await db.doc(`members/${approveUid}`).update({ events: FieldValue.arrayUnion(eventId) });
  console.log(`approved ${approveUid} for ${eventId}`);
}

if (args.includes("--rooms")) {
  const starters = [
    { name: "Welcome Lounge", topic: "Say hi and find your people" },
    { name: "Founders × Funders", topic: "Capital, ideas, and partnerships" },
    { name: "Giving Back", topic: "Non-profit collaboration and board service" },
  ];
  for (const room of starters) {
    await db.collection("rooms").add({
      ...room,
      eventId: "summit",
      imageUrl: "",
      hidden: false,
      createdBy: "seed",
      createdAt: FieldValue.serverTimestamp(),
    });
  }
  console.log(`created ${starters.length} starter rooms`);
}

// The member lobby filters `where hidden == false` (the rules demand it), so
// rooms created before the hidden feature must be stamped hidden: false or
// they silently vanish from the lobby. Idempotent; run once before deploying
// the hidden-rooms release.
if (args.includes("--backfill-hidden")) {
  const snap = await db.collection("rooms").get();
  let updated = 0;
  for (const d of snap.docs) {
    if (typeof d.data().hidden !== "boolean") {
      await d.ref.update({ hidden: false });
      updated++;
    }
  }
  console.log(`backfilled hidden: false on ${updated} of ${snap.size} rooms`);
}

console.log("done.");

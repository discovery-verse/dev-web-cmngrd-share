#!/usr/bin/env node
/**
 * Seed the LOCAL EMULATORS with a rich demo dataset (safe to re-run; wipes
 * nothing, overwrites the same doc ids). Never touches production — it
 * refuses to run without emulator hosts set.
 *
 *   npm run demo:seed        (emulators must be running: npm run demo:emulators)
 */
process.env.FIRESTORE_EMULATOR_HOST ??= "localhost:8765";
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= "localhost:9299";

import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";

const PROJECT = "demo-cg";
initializeApp({ projectId: PROJECT });
const db = getFirestore();
const auth = getAuth();

const DEMO_UID = "demo-user";
const DEMO_EMAIL = "demo@commonground.app";

const pairId = (a, b) => (a < b ? `${a}_${b}` : `${b}_${a}`);
const minsAgo = (m) => Timestamp.fromMillis(Date.now() - m * 60_000);

// ---- auth user with a FIXED uid so seeded relationships attach to whoever
// clicks "Enter the demo"
try {
  await auth.createUser({ uid: DEMO_UID, email: DEMO_EMAIL, emailVerified: true });
  console.log(`created auth user ${DEMO_EMAIL} (${DEMO_UID})`);
} catch (e) {
  if (e.code !== "auth/uid-already-exists" && e.code !== "auth/email-already-exists") throw e;
  console.log("demo auth user already exists");
}

// ---- config + admin
await db.doc("config/app").set({ dmRequiresConnection: false });
await db.doc(`admins/${DEMO_UID}`).set({ grantedAt: FieldValue.serverTimestamp() });

// ---- events (the communities members get approved into)
const EVENTS = [
  ["summit", "Annual Community Summit", "Summit", 1],
  ["community", "Community", "Community", 2],
  ["circle", "Members Circle", "Circle", 3],
];
for (const [id, name, shortName, order] of EVENTS) {
  await db.doc(`events/${id}`).set({ name, shortName, order });
}
console.log(`seeded ${EVENTS.length} events (Summit / Community / Circle)`);

// ---- members
const member = (name, title, company, group) => ({
  name, title, company, group,
  nameLower: name.toLowerCase(), companyLower: company.toLowerCase(),
  createdAt: FieldValue.serverTimestamp(),
});
const contact = (handle) => ({
  email: `${handle}@example.com`, phone: "+65 9123 4567", linkedin: `linkedin.com/in/${handle}`,
});

const PEOPLE = {
  [DEMO_UID]: member("Demo Member", "Founder & CEO", "Common Ground Demo Co", "founder"),
  "demo-ruth": member("Ruth Lim", "Chief Operating Officer", "Havenly", "nonprofit"),
  "demo-david": member("David Ong", "Founder & CEO", "Tabernacle Labs", "founder"),
  "demo-grace": member("Grace Chen", "Managing Director", "Meridian Capital", "corporate"),
  "demo-samuel": member("Samuel Tan", "Executive Director", "Bread of Life SG", "nonprofit"),
  "demo-hannah": member("Hannah Wong", "Co-founder", "Shalom Health", "founder"),
  "demo-joseph": member("Joseph Lee", "VP Engineering", "NorthStar Tech", "corporate"),
  "demo-esther": member("Esther Ng", "CEO", "Mustard Seed Ventures", "founder"),
  "demo-caleb": member("Caleb Goh", "Partnerships Lead", "Hope Exchange", "nonprofit"),
  "demo-naomi": member("Naomi Teo", "Chief HR Officer", "Solid Rock Holdings", "corporate"),
};
// Admin-granted event approvals (everyone is at the summit; some overlap the
// other two communities; the demo member is approved for all three).
const EVENT_TAGS = {
  [DEMO_UID]: ["summit", "community", "circle"],
  "demo-ruth": ["summit", "community"],
  "demo-david": ["summit", "community"],
  "demo-grace": ["summit", "circle"],
  "demo-samuel": ["summit", "community"],
  "demo-hannah": ["summit"],
  "demo-joseph": ["summit", "circle"],
  "demo-esther": ["summit"],
  "demo-caleb": ["summit", "community"],
  "demo-naomi": ["summit", "circle"],
};
for (const [uid, data] of Object.entries(PEOPLE)) {
  await db.doc(`members/${uid}`).set({ ...data, events: EVENT_TAGS[uid] ?? [] });
  await db.doc(`members/${uid}/private/contact`).set(
    uid === DEMO_UID ? { email: DEMO_EMAIL, phone: "+65 9000 0000", linkedin: "linkedin.com/in/demo" } : contact(uid.replace("demo-", "")),
  );
}
console.log(`seeded ${Object.keys(PEOPLE).length} members`);

// ---- connections: one accepted (contact unlocked), one incoming request
await db.doc(`connections/${pairId(DEMO_UID, "demo-ruth")}`).set({
  users: [DEMO_UID, "demo-ruth"].sort(), requestedBy: "demo-ruth",
  status: "accepted", createdAt: minsAgo(2880),
});
await db.doc(`connections/${pairId(DEMO_UID, "demo-david")}`).set({
  users: [DEMO_UID, "demo-david"].sort(), requestedBy: "demo-david",
  status: "pending", createdAt: minsAgo(45),
});
console.log("seeded connections (1 accepted with Ruth, 1 incoming from David)");

// ---- DM thread with Ruth (with an unread last message)
const tid = pairId(DEMO_UID, "demo-ruth");
await db.doc(`threads/${tid}`).set({
  participants: [DEMO_UID, "demo-ruth"].sort(),
  participantNames: { [DEMO_UID]: "Demo Member", "demo-ruth": "Ruth Lim" },
  lastMessage: "Would love that — are you around after the 2pm session?",
  lastSenderId: "demo-ruth", lastMessageAt: minsAgo(12), reads: {},
});
const dm = [
  [DEMO_UID, "Ruth! So good to connect at last. Loved what you shared about Havenly's shelter programme.", 95],
  ["demo-ruth", "Likewise! Your team's journey really resonated with me.", 80],
  [DEMO_UID, "We should grab coffee and talk about the mentoring idea.", 20],
  ["demo-ruth", "Would love that — are you around after the 2pm session?", 12],
];
for (const [senderId, text, m] of dm) {
  await db.collection(`threads/${tid}/messages`).add({ senderId, text, createdAt: minsAgo(m) });
}
console.log("seeded DM thread with Ruth (1 unread)");

// ---- rooms (+ a lively Welcome Lounge)
const rooms = [
  // [id, event, name, topic, cover ("" → generated cover)]
  ["room-lounge", "summit", "Welcome Lounge", "Say hi and find your people", "https://picsum.photos/seed/lounge/600/360"],
  ["room-funders", "summit", "Founders × Funders", "Capital, ideas, and partnerships", "https://picsum.photos/seed/funders/600/360"],
  ["room-giving", "summit", "Giving Back", "Non-profit collaboration and board service", ""],
  ["room-community-hub", "community", "Community Hub", "Show and tell", "https://picsum.photos/seed/venture/600/360"],
  ["room-circle-tbl", "circle", "Members' Table", "Round-table", ""],
];
for (const [id, eventId, name, topic, imageUrl] of rooms) {
  await db.doc(`rooms/${id}`).set({ eventId, name, topic, imageUrl, hidden: false, createdBy: "seed", createdAt: FieldValue.serverTimestamp() });
}
for (const uid of ["demo-grace", "demo-samuel", "demo-hannah"]) {
  await db.doc(`rooms/room-lounge/participants/${uid}`).set({ name: PEOPLE[uid].name, joinedAt: minsAgo(30) });
}
const lounge = [
  ["demo-grace", "Morning everyone! Grace here from Meridian — first time at this gathering.", 28],
  ["demo-samuel", "Welcome Grace! The 11am panel on faith-driven leadership is not to be missed.", 25],
  ["demo-hannah", "Seconding that. Also — coffee table at the back has the good beans ☕", 22],
];
for (const [senderId, text, m] of lounge) {
  await db.collection("rooms/room-lounge/messages").add({
    senderId, senderName: PEOPLE[senderId].name, text, createdAt: minsAgo(m),
  });
}
console.log("seeded 3 rooms (Welcome Lounge has 3 people chatting)");

// ---- idea board
const posts = [
  {
    id: "post-1", authorId: "demo-esther", topic: "Asks",
    title: "Looking for a technical co-founder", body: "Mustard Seed is spinning out a micro-lending platform for hawker businesses. Need someone who's built fintech infra and shares our values.",
    reactedBy: ["demo-david", "demo-joseph", "demo-grace"], mins: 300,
    comments: [["demo-joseph", "Happy to intro you to two engineers from my old team — DMing you."]],
  },
  {
    id: "post-2", authorId: "demo-grace", topic: "Offers",
    title: "Offering: board-readiness mentoring for non-profit leaders", body: "I have capacity to mentor 2–3 non-profit EDs on governance, fundraising strategy, and board management this quarter.",
    reactedBy: ["demo-samuel", "demo-caleb", "demo-ruth", "demo-hannah"], mins: 240,
    comments: [["demo-samuel", "This is exactly what we need at Bread of Life — reaching out!"], ["demo-caleb", "Incredibly generous, thank you Grace."]],
  },
  {
    id: "post-3", authorId: "demo-david", topic: "Ideas",
    title: "Marketplace chaplaincy network?", body: "What if we pooled resources to place chaplains across our companies — shared cost, shared care. Anyone explored this?",
    reactedBy: ["demo-naomi", "demo-esther"], mins: 180, comments: [],
  },
  {
    id: "post-4", authorId: "demo-caleb", topic: "Opportunities",
    title: "Corporate volunteering slots — December food drive", body: "Hope Exchange has 40 volunteer slots for our year-end drive. Great for team offsites with purpose.", link: "https://example.com/food-drive",
    reactedBy: ["demo-naomi"], mins: 120, comments: [],
  },
  {
    id: "post-5", authorId: "demo-hannah", topic: "Encouragement",
    title: "For whoever needs it today", body: "\"And let us not grow weary of doing good, for in due season we will reap, if we do not give up.\" — Gal 6:9. Keep building, friends.",
    reactedBy: ["demo-ruth", "demo-samuel", "demo-grace", "demo-esther", "demo-caleb"], mins: 60,
    comments: [["demo-ruth", "Needed this. Thank you Hannah 🙏"]],
  },
  {
    id: "post-6", authorId: "demo-naomi", topic: "Asks",
    title: "How do you handle faith conversations at work?", body: "Genuinely curious how founders here create space for faith without making colleagues of other beliefs uncomfortable. War stories welcome.",
    reactedBy: ["demo-david", "demo-hannah"], mins: 30,
    comments: [["demo-david", "We anchor on values, not language. Happy to share our playbook."]],
  },
  {
    id: "post-community-1", eventId: "community", authorId: "demo-david", topic: "Ideas",
    title: "Shared analytics stack for mission ventures", body: "Half of us are rebuilding the same dashboards. Proposal: a common template + monthly working group.",
    reactedBy: ["demo-ruth", "demo-caleb"], mins: 200,
    comments: [["demo-caleb", "Count Hope Exchange in."]],
  },
  {
    id: "post-circle-1", eventId: "circle", authorId: "demo-grace", topic: "Opportunities",
    title: "Co-investment circle — Q4 redemptive deals", body: "Meridian is opening two allocations to community co-investors this quarter. DM me for the memo.",
    reactedBy: ["demo-joseph", "demo-naomi"], mins: 150,
    comments: [],
  },
];
for (const p of posts) {
  await db.doc(`posts/${p.id}`).set({
    eventId: p.eventId ?? "summit",
    authorId: p.authorId, authorName: PEOPLE[p.authorId].name,
    title: p.title, body: p.body, link: p.link ?? "", topic: p.topic,
    reactedBy: p.reactedBy, reactionCount: p.reactedBy.length,
    commentCount: p.comments.length, createdAt: minsAgo(p.mins),
  });
  for (const [authorId, text] of p.comments) {
    await db.collection(`posts/${p.id}/comments`).add({
      authorId, authorName: PEOPLE[authorId].name, text, createdAt: minsAgo(p.mins - 10),
    });
  }
}
console.log(`seeded ${posts.length} idea-board posts`);

console.log("\ndemo data ready — sign in with the “Enter the demo” button.");

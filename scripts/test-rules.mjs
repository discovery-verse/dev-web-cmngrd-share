#!/usr/bin/env node
/**
 * Security-rules verification against the Firestore emulator.
 * Proves the two hard guarantees (contact gating + DM-scope toggle) and the
 * supporting invariants. Run with the emulator available:
 *
 *   firebase emulators:exec --only firestore --project demo-cg "node scripts/test-rules.mjs"
 */
import { readFileSync } from "node:fs";
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, query, where, writeBatch } from "firebase/firestore";

// Use an isolated project id when pointing at an already-running emulator
// (RULES_TEST_PROJECT) so test data never mixes with seeded demo data.
const env = await initializeTestEnvironment({
  projectId: process.env.RULES_TEST_PROJECT ?? "demo-cg",
  firestore: { rules: readFileSync("firestore.rules", "utf8") },
});

const ALICE = "alice-uid";
const BOB = "bob-uid";
const CARA = "cara-uid";
const PAIR_AB = [ALICE, BOB].sort().join("_");

let passed = 0;
let failed = 0;
async function check(name, promise) {
  try {
    await promise;
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.error(`  ✗ ${name}\n    ${e.message?.split("\n")[0]}`);
  }
}

// ---- seed baseline data with rules disabled (as the seed script / console would)
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  await setDoc(doc(db, "config", "app"), { dmRequiresConnection: false });
  await setDoc(doc(db, "events", "summit"), { name: "Summit", shortName: "Summit", order: 1 });
  await setDoc(doc(db, "events", "circle"), { name: "Circle", shortName: "Circle", order: 3 });
  for (const [uid, name] of [[ALICE, "Alice"], [BOB, "Bob"], [CARA, "Cara"]]) {
    await setDoc(doc(db, "members", uid), {
      name, title: "CEO", company: "Acme", groups: ["founder"],
      nameLower: name.toLowerCase(), companyLower: "acme", createdAt: new Date(),
      events: ["summit"],
    });
    await setDoc(doc(db, "members", uid, "private", "contact"), {
      email: `${name.toLowerCase()}@example.com`, phone: "+65 9000", linkedin: "linkedin.com/in/x",
    });
  }
});

const anon = env.unauthenticatedContext().firestore();
const alice = env.authenticatedContext(ALICE).firestore();
const bob = env.authenticatedContext(BOB).firestore();
const cara = env.authenticatedContext(CARA).firestore();

console.log("\nAuth gate — nothing without sign-in:");
await check("anon cannot list the directory", assertFails(getDocs(collection(anon, "members"))));
await check("anon cannot read a profile", assertFails(getDoc(doc(anon, "members", ALICE))));
await check("anon cannot read contact details", assertFails(getDoc(doc(anon, "members", ALICE, "private", "contact"))));

console.log("\nDirectory (feature 1):");
await check("member can list the directory", assertSucceeds(getDocs(collection(alice, "members"))));
await check("member can read another public profile", assertSucceeds(getDoc(doc(alice, "members", BOB))));

console.log("\nContact gating (feature 2) — THE guarantee:");
await check("UNCONNECTED member CANNOT read contact details", assertFails(getDoc(doc(alice, "members", BOB, "private", "contact"))));
await check("owner can read own contact details", assertSucceeds(getDoc(doc(alice, "members", ALICE, "private", "contact"))));
await check("contact fields cannot be written into the public profile", assertFails(updateDoc(doc(alice, "members", ALICE), { email: "leak@example.com" })));
await check("owner can set their profile photo + cover URLs", assertSucceeds(updateDoc(doc(alice, "members", ALICE), { photoUrl: "https://s/p.jpg", coverUrl: "https://s/c.jpg" })));
await check("cannot set another member's profile photo", assertFails(updateDoc(doc(bob, "members", ALICE), { photoUrl: "https://evil/x.jpg" })));
await check("owner can set location / about / interests", assertSucceeds(updateDoc(doc(alice, "members", ALICE), { location: "Singapore", about: "Founder & investor.", interests: "Faith & tech." })));
await check("about text over the length cap is rejected", assertFails(updateDoc(doc(alice, "members", ALICE), { about: "x".repeat(1501) })));
await check("cannot edit another member's about", assertFails(updateDoc(doc(bob, "members", ALICE), { about: "vandalised" })));

console.log("\nGroups — multi-select + admin gating:");
const DAVE = "dave-uid";
const dave = env.authenticatedContext(DAVE).firestore();
// Profiles are created ONLY server-side (/api/onboarding via the Admin SDK) so
// the per-event "allow sign-ups" gate can't be bypassed — a client creating its
// own member doc is denied outright, self-serve groups or not.
await check("client-side self-signup (member create) is DENIED — goes through the server", assertFails(setDoc(doc(dave, "members", DAVE), {
  name: "Dave", title: "", company: "", groups: ["founder", "investor"],
  nameLower: "dave", companyLower: "", createdAt: new Date(),
})));
await check("owner can add another self-serve group", assertSucceeds(updateDoc(doc(alice, "members", ALICE), { groups: ["founder", "executive"] })));
await check("owner CANNOT self-grant an admin-only group", assertFails(updateDoc(doc(alice, "members", ALICE), { groups: ["founder", "speaker"] })));
await env.withSecurityRulesDisabled(async (ctx) => {
  // Simulate a pre-migration profile that only ever had the legacy
  // singular `group` field, never touched by groups-aware code.
  await setDoc(doc(ctx.firestore(), "members", "legacy-uid"), {
    name: "Legacy", title: "", company: "", group: "founder",
    nameLower: "legacy", companyLower: "", createdAt: new Date(),
  });
});
await check("legacy profile with no groups field can still edit unrelated fields", assertSucceeds(
  updateDoc(doc(env.authenticatedContext("legacy-uid").firestore(), "members", "legacy-uid"), { photoUrl: "https://s/p.jpg" }),
));
// The profile page listens to the pair doc BEFORE it exists; a read rule that
// touches resource.data errors on a missing doc and kills that listener, so
// the Connect button never updates. Regression for that.
await check("party can read a connection that doesn't exist yet", assertSucceeds(getDoc(doc(alice, "connections", PAIR_AB))));
await check("third party cannot probe a nonexistent connection", assertFails(getDoc(doc(cara, "connections", PAIR_AB))));
await check("cannot create a pre-accepted connection", assertFails(setDoc(doc(alice, "connections", PAIR_AB), { users: PAIR_AB.split("_"), requestedBy: ALICE, status: "accepted", createdAt: new Date() })));
await check("cannot spoof requestedBy", assertFails(setDoc(doc(alice, "connections", PAIR_AB), { users: PAIR_AB.split("_"), requestedBy: BOB, status: "pending", createdAt: new Date() })));
await check("member can send a connection request", assertSucceeds(setDoc(doc(alice, "connections", PAIR_AB), { users: PAIR_AB.split("_"), requestedBy: ALICE, status: "pending", createdAt: new Date() })));
// The People directory badges rows via this list query — the read rule must
// stay provable from `where users array-contains me` (an id-derived rule
// isn't, and silently kills the whole query). Regression for that.
await check("party can list their own connections", assertSucceeds(getDocs(query(collection(alice, "connections"), where("users", "array-contains", ALICE)))));
await check("cannot list someone else's connections", assertFails(getDocs(query(collection(cara, "connections"), where("users", "array-contains", ALICE)))));
await check("still pending → contact stays locked", assertFails(getDoc(doc(alice, "members", BOB, "private", "contact"))));
await check("requester cannot accept their own request", assertFails(updateDoc(doc(alice, "connections", PAIR_AB), { status: "accepted" })));
await check("third party cannot even read the connection", assertFails(getDoc(doc(cara, "connections", PAIR_AB))));
await check("recipient can accept", assertSucceeds(updateDoc(doc(bob, "connections", PAIR_AB), { status: "accepted" })));
await check("connected → Alice can read Bob's contact", assertSucceeds(getDoc(doc(alice, "members", BOB, "private", "contact"))));
await check("connected → Bob can read Alice's contact", assertSucceeds(getDoc(doc(bob, "members", ALICE, "private", "contact"))));
await check("third party STILL cannot read either contact", assertFails(getDoc(doc(cara, "members", BOB, "private", "contact"))));
await check("only the owner can write their contact doc", assertFails(setDoc(doc(alice, "members", BOB, "private", "contact"), { email: "hijack@x.com", phone: "", linkedin: "" })));

console.log("\nDisconnect re-locks:");
await check("either party can disconnect", assertSucceeds(deleteDoc(doc(alice, "connections", PAIR_AB))));
await check("contact is locked again immediately", assertFails(getDoc(doc(alice, "members", BOB, "private", "contact"))));

console.log("\nDMs (feature 3) — open mode (dmRequiresConnection: false):");
const threadData = { participants: PAIR_AB.split("_"), participantNames: {}, lastMessage: "hi", lastSenderId: ALICE, lastMessageAt: new Date(), reads: {} };
// Same pre-existence listener issue as connections: the chat page listens to
// the thread doc before the first message creates it.
await check("participant can read a thread that doesn't exist yet", assertSucceeds(getDoc(doc(alice, "threads", PAIR_AB))));
await check("non-participant cannot probe a nonexistent thread", assertFails(getDoc(doc(cara, "threads", PAIR_AB))));
await check("unconnected members can start a thread", assertSucceeds(setDoc(doc(alice, "threads", PAIR_AB), threadData)));
await check("participant can send a message", assertSucceeds(setDoc(doc(alice, "threads", PAIR_AB, "messages", "m1"), { senderId: ALICE, text: "hello", createdAt: new Date() })));
// The Messages inbox and nav badge use this list query — same provability
// requirement as the connections list.
await check("participant can list their own threads", assertSucceeds(getDocs(query(collection(alice, "threads"), where("participants", "array-contains", ALICE)))));
await check("cannot list someone else's threads", assertFails(getDocs(query(collection(cara, "threads"), where("participants", "array-contains", ALICE)))));
await check("non-participant cannot read the thread", assertFails(getDoc(doc(cara, "threads", PAIR_AB))));
await check("non-participant cannot read messages", assertFails(getDoc(doc(cara, "threads", PAIR_AB, "messages", "m1"))));
await check("cannot send as someone else", assertFails(setDoc(doc(bob, "threads", PAIR_AB, "messages", "m2"), { senderId: ALICE, text: "spoof", createdAt: new Date() })));
// The real client sends the FIRST message as a single batch that creates the
// thread AND the message together — a rule get() can't see the sibling thread
// write mid-batch, so the message rule must derive participants from the
// thread id, not from the (uncommitted) thread doc. Regression for that.
const PAIR_BC = [BOB, CARA].sort().join("_");
await check("first message to a NEW thread (thread + message in ONE batch) succeeds", assertSucceeds((() => {
  const b = writeBatch(bob);
  const t = doc(bob, "threads", PAIR_BC);
  b.set(t, { participants: PAIR_BC.split("_"), participantNames: { [BOB]: "Bob", [CARA]: "Cara" }, lastMessage: "hi", lastSenderId: BOB, lastMessageAt: new Date() }, { merge: true });
  b.set(doc(collection(t, "messages")), { senderId: BOB, text: "hi Cara", createdAt: new Date() });
  return b.commit();
})()));
await check("batched first message CANNOT spoof another sender", assertFails((() => {
  const b = writeBatch(bob);
  const pair = [BOB, "zed-uid"].sort().join("_");
  const t = doc(bob, "threads", pair);
  b.set(t, { participants: pair.split("_"), participantNames: {}, lastMessage: "x", lastSenderId: BOB, lastMessageAt: new Date() }, { merge: true });
  b.set(doc(collection(t, "messages")), { senderId: "zed-uid", text: "spoof", createdAt: new Date() });
  return b.commit();
})()));

console.log("\nDMs — connections-only mode (flip the single flag):");
await env.withSecurityRulesDisabled(async (ctx) => {
  await setDoc(doc(ctx.firestore(), "config", "app"), { dmRequiresConnection: true });
});
const PAIR_AC = [ALICE, CARA].sort().join("_");
await check("unconnected: creating a thread is DENIED", assertFails(setDoc(doc(alice, "threads", PAIR_AC), { ...threadData, participants: PAIR_AC.split("_") })));
await check("unconnected: sending into existing thread is DENIED", assertFails(setDoc(doc(alice, "threads", PAIR_AB, "messages", "m3"), { senderId: ALICE, text: "blocked", createdAt: new Date() })));
await env.withSecurityRulesDisabled(async (ctx) => {
  await setDoc(doc(ctx.firestore(), "connections", PAIR_AC), { users: PAIR_AC.split("_"), requestedBy: ALICE, status: "accepted", createdAt: new Date() });
});
await check("connected: creating a thread is allowed", assertSucceeds(setDoc(doc(alice, "threads", PAIR_AC), { ...threadData, participants: PAIR_AC.split("_") })));
await env.withSecurityRulesDisabled(async (ctx) => {
  await setDoc(doc(ctx.firestore(), "config", "app"), { dmRequiresConnection: false });
});

console.log("\nBoard (feature 4):");
await check("member can create a post", assertSucceeds(setDoc(doc(alice, "posts", "p1"), { eventId: "summit", authorId: ALICE, authorName: "Alice", title: "Idea", body: "", link: "", topic: "Ideas", reactedBy: [], reactionCount: 0, commentCount: 0, createdAt: new Date() })));
await check("author can create a post WITH an image", assertSucceeds(setDoc(doc(alice, "posts", "pimg"), { eventId: "summit", authorId: ALICE, authorName: "Alice", title: "Pic", body: "", link: "", topic: "Ideas", imageUrl: "https://s/i.jpg", reactedBy: [], reactionCount: 0, commentCount: 0, createdAt: new Date() })));
await check("author can add/replace the post image later", assertSucceeds(updateDoc(doc(alice, "posts", "pimg"), { imageUrl: "https://s/j.jpg" })));
await check("non-author cannot change the post image", assertFails(updateDoc(doc(bob, "posts", "pimg"), { imageUrl: "https://evil/x.jpg" })));
await check("cannot post as someone else", assertFails(setDoc(doc(bob, "posts", "p2"), { eventId: "summit", authorId: ALICE, authorName: "Alice", title: "x", body: "", link: "", topic: "Ideas", reactedBy: [], reactionCount: 0, commentCount: 0, createdAt: new Date() })));
await check("other member can react (add own uid)", assertSucceeds(updateDoc(doc(bob, "posts", "p1"), { reactedBy: [BOB], reactionCount: 1 })));
await check("cannot inflate the count", assertFails(updateDoc(doc(bob, "posts", "p1"), { reactedBy: [BOB], reactionCount: 5 })));
await check("cannot react on someone's behalf", assertFails(updateDoc(doc(cara, "posts", "p1"), { reactedBy: [BOB, ALICE, CARA], reactionCount: 3 })));
await check("non-author cannot edit the post body", assertFails(updateDoc(doc(bob, "posts", "p1"), { title: "defaced" })));
await check("non-author cannot delete the post", assertFails(deleteDoc(doc(bob, "posts", "p1"))));
await check("member can comment", assertSucceeds(setDoc(doc(bob, "posts", "p1", "comments", "c1"), { authorId: BOB, authorName: "Bob", text: "love it", createdAt: new Date() })));

console.log("\nEvents & approval:");
await check("member can read the events list", assertSucceeds(getDocs(collection(alice, "events"))));
await check("anon cannot read events", assertFails(getDocs(collection(anon, "events"))));
await check("non-admin cannot create an event", assertFails(setDoc(doc(alice, "events", "rogue"), { name: "Rogue", shortName: "R", order: 9 })));
await check("member CANNOT self-approve into an event", assertFails(updateDoc(doc(alice, "members", ALICE), { events: ["summit", "circle"] })));
await check("member cannot tag someone else's events", assertFails(updateDoc(doc(alice, "members", BOB), { events: [] })));
await check("cannot post into an event you're not approved for", assertFails(setDoc(doc(alice, "posts", "p-circle"), { eventId: "circle", authorId: ALICE, authorName: "Alice", title: "sneak", body: "", link: "", topic: "Ideas", reactedBy: [], reactionCount: 0, commentCount: 0, createdAt: new Date() })));

console.log("\nRooms (feature 5):");
await check("non-admin cannot create a room", assertFails(setDoc(doc(alice, "rooms", "r1"), { name: "Room", topic: "", createdBy: ALICE, createdAt: new Date() })));
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  await setDoc(doc(db, "rooms", "r1"), { eventId: "summit", name: "Room", topic: "", hidden: false, createdBy: "seed", createdAt: new Date() });
  // Staged room — must stay invisible to members until an admin reveals it.
  await setDoc(doc(db, "rooms", "r-hidden"), { eventId: "summit", name: "Staged", topic: "", hidden: true, createdBy: "seed", createdAt: new Date() });
  // Pre-feature room with no hidden field at all (before --backfill-hidden runs).
  await setDoc(doc(db, "rooms", "r-legacy"), { eventId: "summit", name: "Legacy", topic: "", createdBy: "seed", createdAt: new Date() });
});
await check("member can read a visible room", assertSucceeds(getDoc(doc(alice, "rooms", "r1"))));
await check("member can still read a LEGACY room (no hidden field)", assertSucceeds(getDoc(doc(alice, "rooms", "r-legacy"))));
await check("member CANNOT read a hidden room", assertFails(getDoc(doc(alice, "rooms", "r-hidden"))));
// The exact lobby query shape — must stay provable or the whole lobby dies.
await check("lobby list (eventId + hidden == false) succeeds", assertSucceeds(getDocs(query(collection(alice, "rooms"), where("eventId", "==", "summit"), where("hidden", "==", false)))));
await check("member cannot list rooms WITHOUT the hidden filter", assertFails(getDocs(query(collection(alice, "rooms"), where("eventId", "==", "summit")))));
await check("member can join (own participant doc)", assertSucceeds(setDoc(doc(alice, "rooms", "r1", "participants", ALICE), { name: "Alice", joinedAt: new Date() })));
await check("cannot write someone else's presence", assertFails(setDoc(doc(alice, "rooms", "r1", "participants", BOB), { name: "Bob", joinedAt: new Date() })));
await check("member can chat in the room", assertSucceeds(setDoc(doc(alice, "rooms", "r1", "messages", "rm1"), { senderId: ALICE, senderName: "Alice", text: "hi all", createdAt: new Date() })));
await check("member can RSVP (own rsvp doc)", assertSucceeds(setDoc(doc(alice, "rooms", "r1", "rsvps", ALICE), { name: "Alice", createdAt: new Date() })));
await check("cannot RSVP as someone else", assertFails(setDoc(doc(alice, "rooms", "r1", "rsvps", BOB), { name: "Bob", createdAt: new Date() })));
await check("everyone can read a room's rsvps", assertSucceeds(getDocs(collection(bob, "rooms", "r1", "rsvps"))));
await check("member can withdraw their RSVP", assertSucceeds(deleteDoc(doc(alice, "rooms", "r1", "rsvps", ALICE))));

console.log("\nModeration & admin:");
await check("member can file a report", assertSucceeds(setDoc(doc(bob, "reports", "rep1"), { targetType: "post", targetPath: "posts/p1", excerpt: "Idea", reason: "", reporterId: BOB, status: "open", createdAt: new Date() })));
await check("non-admin cannot read reports", assertFails(getDoc(doc(bob, "reports", "rep1"))));
await check("non-admin cannot grant admin", assertFails(setDoc(doc(alice, "admins", ALICE), {})));
await check("non-admin cannot flip the DM flag", assertFails(updateDoc(doc(alice, "config", "app"), { dmRequiresConnection: true })));
await env.withSecurityRulesDisabled(async (ctx) => {
  await setDoc(doc(ctx.firestore(), "admins", CARA), {});
});
await check("admin can read reports", assertSucceeds(getDoc(doc(cara, "reports", "rep1"))));
await check("admin CAN read a hidden room (lobby preview)", assertSucceeds(getDoc(doc(cara, "rooms", "r-hidden"))));
await check("admin CAN list rooms without the hidden filter", assertSucceeds(getDocs(query(collection(cara, "rooms"), where("eventId", "==", "summit")))));
await check("admin CAN approve a member for an event", assertSucceeds(updateDoc(doc(cara, "members", ALICE), { events: ["summit", "circle"] })));
await check("approved member can now post into that event", assertSucceeds(setDoc(doc(alice, "posts", "p-circle-ok"), { eventId: "circle", authorId: ALICE, authorName: "Alice", title: "now allowed", body: "", link: "", topic: "Ideas", reactedBy: [], reactionCount: 0, commentCount: 0, createdAt: new Date() })));
await check("admin can delete a reported post", assertSucceeds(deleteDoc(doc(cara, "posts", "p1"))));
await check("admin can remove a member profile", assertSucceeds(deleteDoc(doc(cara, "members", BOB))));
await check("admin can ban", assertSucceeds(setDoc(doc(cara, "banned", BOB), { bannedAt: new Date(), by: CARA })));
await check("banned member cannot post", assertFails(setDoc(doc(bob, "posts", "p9"), { eventId: "summit", authorId: BOB, authorName: "Bob", title: "spam", body: "", link: "", topic: "Ideas", reactedBy: [], reactionCount: 0, commentCount: 0, createdAt: new Date() })));

await env.cleanup();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);

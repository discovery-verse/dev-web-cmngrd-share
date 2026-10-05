import "server-only";
import type { QueryDocumentSnapshot } from "firebase-admin/firestore";
import { adminDb, toMillis } from "@/lib/server/admin";
import type { MemberDTO } from "@/lib/api-types";
import { resolveMemberGroups } from "@/lib/types";

/**
 * Build MemberDTOs for a set of member docs, enriching each with its private
 * contact card and banned/admin flags. Reads run in parallel across members.
 */
export async function toMemberDTOs(docs: QueryDocumentSnapshot[]): Promise<MemberDTO[]> {
  return Promise.all(
    docs.map(async (d) => {
      const data = d.data();
      const [contactSnap, bannedSnap, adminSnap] = await Promise.all([
        adminDb.doc(`members/${d.id}/private/contact`).get(),
        adminDb.doc(`banned/${d.id}`).get(),
        adminDb.doc(`admins/${d.id}`).get(),
      ]);
      const contact = contactSnap.data() ?? {};
      return {
        uid: d.id,
        name: data.name ?? "",
        title: data.title ?? "",
        company: data.company ?? "",
        groups: resolveMemberGroups(data),
        events: (data.events ?? []) as string[],
        email: contact.email ?? "",
        phone: contact.phone ?? "",
        linkedin: contact.linkedin ?? "",
        banned: bannedSnap.exists,
        admin: adminSnap.exists,
        createdAt: toMillis(data.createdAt),
      };
    }),
  );
}

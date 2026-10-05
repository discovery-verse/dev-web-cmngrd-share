import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { ReportTargetType } from "@/lib/types";

/**
 * File a report for admins to review. Any signed-in member can create one;
 * only admins can read/resolve them (enforced in firestore.rules).
 */
export function submitReport(input: {
  targetType: ReportTargetType;
  targetPath: string;
  excerpt: string;
  reporterId: string;
  reason?: string;
}) {
  return addDoc(collection(db, "reports"), {
    targetType: input.targetType,
    targetPath: input.targetPath,
    excerpt: input.excerpt.slice(0, 200),
    reason: input.reason ?? "",
    reporterId: input.reporterId,
    status: "open",
    createdAt: serverTimestamp(),
  });
}

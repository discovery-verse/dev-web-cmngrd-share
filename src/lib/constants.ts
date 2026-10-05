import {
  Gift,
  HandHeart,
  HeartHandshake,
  HelpCircle,
  Lightbulb,
  Megaphone,
  type LucideIcon,
} from "lucide-react";

/** localStorage key for the pending magic-link email (Firebase requires it on completion). */
export const EMAIL_FOR_SIGN_IN_KEY = "cg-email-for-sign-in";

/** Topics for the boards. Keep short — they render as filter chips. */
export const BOARD_TOPICS = [
  "Prayer Request",
  "Ideas",
  "Asks",
  "Offers",
  "Opportunities",
  "Encouragement",
] as const;

export type BoardTopic = (typeof BOARD_TOPICS)[number];

/** Accent wash + icon per topic so the wall reads as a colourful-but-calm mosaic. */
export const TOPIC_STYLES: Record<string, { chip: string; bar: string; icon: LucideIcon }> = {
  "Prayer Request": { chip: "bg-violet-soft text-violet", bar: "bg-violet", icon: HandHeart },
  Ideas: { chip: "bg-sky-soft text-sky", bar: "bg-sky", icon: Lightbulb },
  Asks: { chip: "bg-amber-soft text-amber", bar: "bg-amber", icon: HelpCircle },
  Offers: { chip: "bg-sage-soft text-sage", bar: "bg-sage", icon: Gift },
  Opportunities: { chip: "bg-plum-soft text-plum", bar: "bg-plum", icon: Megaphone },
  Encouragement: { chip: "bg-clay-soft text-clay-deep", bar: "bg-clay", icon: HeartHandshake },
};

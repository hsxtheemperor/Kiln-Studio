import type { InquiryBriefRow, InquiryRow } from "@/lib/supabase/database.types";

type DesignerQueueBrief = Pick<
  InquiryBriefRow,
  "id" | "inquiry_id" | "design_complexity"
>;

type DesignerQueueInquiry = Pick<
  InquiryRow,
  "id" | "name" | "email" | "company" | "status" | "priority_score" | "created_at"
>;

export function buildDesignerPriorityQueue(
  briefs: DesignerQueueBrief[],
  inquiries: DesignerQueueInquiry[],
) {
  const inquiryById = new Map(inquiries.map((inquiry) => [inquiry.id, inquiry]));

  return briefs
    .flatMap((brief) => {
      const inquiry = inquiryById.get(brief.inquiry_id);
      return inquiry
        ? [{ ...brief, inquiry, priority_score: inquiry.priority_score }]
        : [];
    })
    .sort(
      (left, right) =>
        right.priority_score - left.priority_score ||
        right.inquiry.created_at.localeCompare(left.inquiry.created_at),
    );
}

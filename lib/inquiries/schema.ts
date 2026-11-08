import { z } from "zod";
import type { InquiryBriefInsert, InquiryInsert } from "../supabase/database.types";

export const INQUIRY_SERVICES = [
  "brand_identity",
  "web_design",
  "product_design",
] as const;

export const INQUIRY_BUDGET_RANGES = [
  "under_5k",
  "5k_10k",
  "10k_25k",
  "25k_50k",
  "50k_plus",
  "not_sure",
] as const;

export const INQUIRY_STATUSES = [
  "new",
  "contacted",
  "accepted",
  "in_progress",
  "closed",
] as const;

export const InquiryStatusSchema = z.enum(INQUIRY_STATUSES);

const optionalText = (maxLength: number) =>
  z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() === "" ? undefined : value,
    z.string().trim().max(maxLength).optional(),
  );

const optionalChoice = <T extends readonly [string, ...string[]]>(
  choices: T,
) =>
  z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.enum(choices).optional(),
  );

const optionalNumber = (max: number, min = 0) =>
  z.preprocess((value) => {
    if (value === "" || value === null || value === undefined) return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : value;
  }, z.number().int().min(min).max(max).optional());

export const PublicInquirySchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    email: z
      .string()
      .trim()
      .max(254)
      .email()
      .transform((email) => email.toLowerCase()),
    company: optionalText(120),
    service: optionalChoice(INQUIRY_SERVICES),
    project_brief: z.string().trim().min(1).max(5000),
    budget_range: optionalChoice(INQUIRY_BUDGET_RANGES),
    timeline: optionalText(120),
    design_goal: optionalText(1200),
    brand_message: optionalText(1200),
    target_audience: optionalText(600),
    desired_outcomes: optionalText(1200),
    references: optionalText(1200),
    time_budget: optionalText(120),
    design_complexity: optionalNumber(10),
    website: z.string().max(200).optional().default(""),
  })
  .strict();

export type PublicInquiryInput = z.infer<typeof PublicInquirySchema>;

export function toInquiryInsert(input: PublicInquiryInput): InquiryInsert {
  return {
    name: input.name,
    email: input.email,
    company: input.company ?? null,
    service: input.service ?? null,
    project_brief: input.project_brief,
    budget_range: input.budget_range ?? null,
    timeline: input.timeline ?? null,
  };
}

export function toInquiryBriefInsert(
  input: PublicInquiryInput,
): Omit<InquiryBriefInsert, "inquiry_id"> {
  return {
    design_goal: input.design_goal ?? "",
    brand_message: input.brand_message ?? "",
    target_audience: input.target_audience ?? null,
    desired_outcomes: input.desired_outcomes ?? null,
    references: input.references ?? null,
    time_budget: input.time_budget ?? null,
    design_complexity: input.design_complexity ?? null,
  };
}

import { describe, expect, it } from "vitest";
import {
  InquiryStatusSchema,
  PublicInquirySchema,
  toInquiryInsert,
} from "../../lib/inquiries/schema";

const validSubmission = {
  name: "  Ada Lovelace  ",
  email: " ADA@EXAMPLE.COM ",
  project_brief: "  A new project identity  ",
};

describe("PublicInquirySchema", () => {
  it("keeps inquiry acceptance distinct from project lifecycle status", () => {
    expect(InquiryStatusSchema.parse("accepted")).toBe("accepted");
    expect(InquiryStatusSchema.safeParse("project").success).toBe(false);
  });

  it("normalizes required fields and maps omitted optional fields to null", () => {
    const parsed = PublicInquirySchema.parse(validSubmission);
    expect(parsed.name).toBe("Ada Lovelace");
    expect(parsed.email).toBe("ada@example.com");
    expect(parsed.similarity_opt_in).toBe(false);
    expect(toInquiryInsert(parsed)).toEqual({
      name: "Ada Lovelace",
      email: "ada@example.com",
      company: null,
      service: null,
      project_brief: "A new project identity",
      budget_range: null,
      timeline: null,
    });
  });

  it("accepts only an explicit boolean for optional similarity consent", () => {
    expect(
      PublicInquirySchema.parse({
        ...validSubmission,
        similarity_opt_in: true,
      }).similarity_opt_in,
    ).toBe(true);
    expect(
      PublicInquirySchema.safeParse({
        ...validSubmission,
        similarity_opt_in: "true",
      }).success,
    ).toBe(false);
  });

  it("rejects empty or oversized required fields", () => {
    expect(
      PublicInquirySchema.safeParse({
        ...validSubmission,
        name: "   ",
      }).success,
    ).toBe(false);
    expect(
      PublicInquirySchema.safeParse({
        ...validSubmission,
        project_brief: "x".repeat(5001),
      }).success,
    ).toBe(false);
  });

  it("rejects unknown fields and controlled values outside the allowlist", () => {
    expect(
      PublicInquirySchema.safeParse({
        ...validSubmission,
        status: "closed",
      }).success,
    ).toBe(false);
    expect(
      PublicInquirySchema.safeParse({
        ...validSubmission,
        service: "custom_service",
      }).success,
    ).toBe(false);
  });

  it("accepts the honeypot field for checking but does not persist it", () => {
    const parsed = PublicInquirySchema.parse({
      ...validSubmission,
      website: "",
      service: "web_design",
      budget_range: "10k_25k",
    });

    expect(parsed.website).toBe("");
    expect(toInquiryInsert(parsed)).not.toHaveProperty("website");
    expect(toInquiryInsert(parsed).service).toBe("web_design");
  });

  it("accepts optional unique reference upload IDs but rejects malformed or duplicated IDs", () => {
    const referenceId = "40000000-0000-4000-8000-000000000001";
    expect(
      PublicInquirySchema.parse({
        ...validSubmission,
        reference_upload_ids: [referenceId],
      }).reference_upload_ids,
    ).toEqual([referenceId]);
    expect(
      PublicInquirySchema.safeParse({
        ...validSubmission,
        reference_upload_ids: ["not-a-uuid"],
      }).success,
    ).toBe(false);
    expect(
      PublicInquirySchema.safeParse({
        ...validSubmission,
        reference_upload_ids: [referenceId, referenceId],
      }).success,
    ).toBe(false);
  });
});

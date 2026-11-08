import { describe, expect, it } from "vitest";
import { ProjectUpdateSchema } from "@/lib/studio/project-schema";

describe("ProjectUpdateSchema", () => {
  it("accepts valid calendar deadlines", () => {
    expect(
      ProjectUpdateSchema.safeParse({ deadline_date: "2028-02-29" }).success,
    ).toBe(true);
  });

  it("accepts clearing an optional deadline or project manager", () => {
    expect(
      ProjectUpdateSchema.safeParse({
        deadline_date: null,
        project_manager_id: null,
      }).success,
    ).toBe(true);
  });

  it.each(["2027-02-29", "2028-02-30", "2028-13-01", "2028-2-01"])(
    "rejects invalid calendar deadline %s",
    (deadline_date) => {
      expect(ProjectUpdateSchema.safeParse({ deadline_date }).success).toBe(false);
    },
  );

  it.each([
    {},
    { status: "active" },
    { project_manager_id: "not-a-uuid" },
    { deadline_date: "2028-01-01", unexpected: true },
  ])("rejects malformed or unsupported project updates", (value) => {
    expect(ProjectUpdateSchema.safeParse(value).success).toBe(false);
  });

  it("accepts the supported completion transition", () => {
    expect(
      ProjectUpdateSchema.safeParse({ status: "completed" }).success,
    ).toBe(true);
  });
});

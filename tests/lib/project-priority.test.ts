import { describe, expect, it } from "vitest";

import {
  computeProjectPriority,
  getPriorityLabel,
} from "@/lib/project-priority";

describe("project priority classification", () => {
  it("returns an unknown priority when no factors are available", () => {
    expect(computeProjectPriority({})).toEqual({
      priority_score: 0,
    });
  });

  it("marks low priorities at the lower edge of the range", () => {
    expect(
      computeProjectPriority({
        budget_range: "under_5k",
        design_complexity: 1,
        timeline: "later",
      }),
    ).toEqual({
      priority_score: 1,
    });
  });

  it("keeps the medium to high range within the expected 0-10 scale", () => {
    expect(
      computeProjectPriority({
        budget_range: "10k_25k",
        design_complexity: 8,
        timeline: "this month",
      }),
    ).toEqual({
      priority_score: 5,
    });
  });

  it("classifies urgent work as the highest priority", () => {
    expect(
      computeProjectPriority({
        budget_range: "50k_plus",
        design_complexity: 10,
        timeline: "urgent asap",
      }),
    ).toEqual({
      priority_score: 8,
    });
  });

  it("keeps an explicitly scored submission above the unknown score", () => {
    expect(
      computeProjectPriority({
        budget_range: "not_sure",
        design_complexity: 0,
      }).priority_score,
    ).toBe(1);
  });

  it("derives labels from the score with one mapping", () => {
    expect([0, 1, 4, 7, 9].map(getPriorityLabel)).toEqual([
      "unknown",
      "low",
      "medium",
      "high",
      "urgent",
    ]);
  });
});

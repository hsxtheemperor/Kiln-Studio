import { describe, expect, it } from "vitest";
import { buildDesignerPriorityQueue } from "@/lib/studio/designer-queue";

function inquiry(id: string, priority_score: number, created_at: string) {
  return {
    id,
    name: `Client ${id}`,
    email: `${id}@example.test`,
    company: null,
    status: "new" as const,
    priority_score,
    created_at,
  };
}

describe("designer priority queue", () => {
  it("orders the selected briefs by absolute score, then newest inquiry", () => {
    const queue = buildDesignerPriorityQueue(
      [
        { id: "brief-old", inquiry_id: "old", design_complexity: 3 },
        { id: "brief-high", inquiry_id: "high", design_complexity: 8 },
        { id: "brief-new", inquiry_id: "new", design_complexity: 4 },
      ],
      [
        inquiry("old", 6, "2026-11-01T10:00:00.000Z"),
        inquiry("high", 9, "2026-11-02T10:00:00.000Z"),
        inquiry("new", 6, "2026-11-03T10:00:00.000Z"),
      ],
    );

    expect(queue.map((item) => item.id)).toEqual([
      "brief-high",
      "brief-new",
      "brief-old",
    ]);
  });

  it("excludes briefs whose inquiry was not included in the ranked inquiry query", () => {
    const queue = buildDesignerPriorityQueue(
      [
        { id: "brief-ranked", inquiry_id: "ranked", design_complexity: 5 },
        { id: "brief-unmatched", inquiry_id: "unmatched", design_complexity: 10 },
      ],
      [inquiry("ranked", 4, "2026-11-03T10:00:00.000Z")],
    );

    expect(queue.map((item) => item.id)).toEqual(["brief-ranked"]);
  });
});

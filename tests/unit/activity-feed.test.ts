import { describe, expect, it } from "vitest";
import {
  getActivitySummary,
  mergeActivityEvents,
} from "@/lib/studio/activity-feed";
import type { SystemActivityLogRow } from "@/lib/supabase/database.types";

function activityEvent(
  overrides: Partial<SystemActivityLogRow> = {},
): SystemActivityLogRow {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    channel_id: "00000000-0000-0000-0000-000000000010",
    table_name: "inquiries",
    record_id: "00000000-0000-0000-0000-000000000020",
    operation: "UPDATE",
    changed_columns: ["status", "updated_at"],
    actor_user_id: null,
    occurred_at: "2026-11-08T10:00:00.000Z",
    ...overrides,
  };
}

describe("system activity feed helpers", () => {
  it("formats audit metadata without exposing row values", () => {
    expect(getActivitySummary(activityEvent())).toEqual({
      title: "inquiry updated",
      details: "status",
    });
  });

  it("merges duplicate events, sorts newest first, and caps the feed", () => {
    const current = Array.from({ length: 25 }, (_, index) =>
      activityEvent({
        id: `00000000-0000-0000-0000-${String(index + 1).padStart(12, "0")}`,
        occurred_at: new Date(Date.UTC(2026, 10, 8, 0, index)).toISOString(),
      }),
    );
    const newest = activityEvent({
      id: "00000000-0000-0000-0000-000000000099",
      occurred_at: "2026-11-09T00:00:00.000Z",
    });

    const retained = current[current.length - 1];
    const merged = mergeActivityEvents(current, [retained, newest]);

    expect(merged).toHaveLength(25);
    expect(merged[0].id).toBe(newest.id);
    expect(merged.filter((event) => event.id === retained.id)).toHaveLength(1);
  });
});

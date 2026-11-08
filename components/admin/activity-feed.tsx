"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import type { SystemActivityLogRow } from "@/lib/supabase/database.types";
import { getActivitySummary, mergeActivityEvents } from "@/lib/studio/activity-feed";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

export function ActivityFeed({
  initialEvents,
  initialError,
}: {
  initialEvents: SystemActivityLogRow[];
  initialError: string | null;
}) {
  const [events, setEvents] = useState(initialEvents);
  const [connectionState, setConnectionState] = useState<"connecting" | "live" | "error">(
    "connecting",
  );
  const [errorMessage, setErrorMessage] = useState(initialError);

  useEffect(() => {
    let channel: RealtimeChannel | undefined;

    try {
      const supabase = createSupabaseBrowserClient();
      channel = supabase
        .channel("admin-system-activity-feed")
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "system_activity_logs",
          },
          (payload) => {
            const event = payload.new as SystemActivityLogRow;
            setEvents((current) => mergeActivityEvents(current, [event]));
          },
        )
        .subscribe((status, err) => {
          if (status === "SUBSCRIBED") {
            setConnectionState("live");
            setErrorMessage(null);

            void supabase
              .from("system_activity_logs")
              .select(
                "id, channel_id, table_name, record_id, operation, changed_columns, actor_user_id, occurred_at",
              )
              .order("occurred_at", { ascending: false })
              .order("id", { ascending: false })
              .limit(25)
              .then(({ data, error }) => {
                if (error) {
                  setErrorMessage(`Could not refresh activity history: ${error.message}`);
                  return;
                }

                if (data) {
                  setEvents((current) => mergeActivityEvents(current, data));
                }
              });
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            setConnectionState("error");
            setErrorMessage(err?.message ?? "The live activity connection is unavailable.");
          } else if (status === "CLOSED") {
            setConnectionState("error");
            setErrorMessage("The live activity connection closed.");
          }
        });
    } catch (error) {
      setConnectionState("error");
      setErrorMessage(
        error instanceof Error ? error.message : "Could not initialize the activity feed.",
      );
    }

    return () => {
      if (channel) {
        void channel.unsubscribe();
      }
    };
  }, []);

  const connectionLabel =
    connectionState === "live"
      ? "Live"
      : connectionState === "connecting"
        ? "Connecting"
        : "Offline";

  return (
    <section className="ops-card activity-feed" aria-labelledby="activity-feed-title">
      <div className="ops-card-header">
        <h3 id="activity-feed-title">System activity</h3>
        <span className={`activity-connection activity-connection-${connectionState}`}>
          <span aria-hidden="true" />
          {connectionLabel}
        </span>
      </div>

      {errorMessage && (
        <p className="activity-feed-notice" role="status">
          {errorMessage}
        </p>
      )}

      {events.length === 0 ? (
        <p className="empty-state">
          {errorMessage ? "Activity history is unavailable." : "No system activity yet."}
        </p>
      ) : (
        <ol className="activity-feed-list" aria-live="polite" aria-relevant="additions">
          {events.map((event) => {
            const summary = getActivitySummary(event);
            const content = (
              <>
                <strong>{summary.title}</strong>
                {summary.details && <span>{summary.details}</span>}
                <time dateTime={event.occurred_at}>
                  {dateFormatter.format(new Date(event.occurred_at))}
                </time>
              </>
            );

            return (
              <li className="activity-feed-item" key={event.id}>
                {event.table_name === "inquiries" && event.record_id ? (
                  <Link href={`/admin/inquiries/${event.record_id}`} className="activity-feed-entry">
                    {content}
                  </Link>
                ) : (
                  <div className="activity-feed-entry">{content}</div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

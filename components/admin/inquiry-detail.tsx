"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { InquiryRow, InquiryStatus } from "@/lib/supabase/database.types";
import { INQUIRY_STATUSES } from "@/lib/inquiries/schema";

type InquiryDetailPayload = InquiryRow & {
  project_briefs?: Array<{
    priority_score: number | null;
    priority_label: string | null;
    design_goal: string | null;
    brand_message: string | null;
    target_audience: string | null;
    desired_outcomes: string | null;
    references: string | null;
    time_budget: string | null;
    design_complexity: number | null;
  }>;
};

const priorityTone: Record<string, string> = {
  unknown: "neutral",
  low: "low",
  medium: "medium",
  high: "high",
  urgent: "urgent",
};

const statusLabels: Record<InquiryStatus, string> = {
  new: "New",
  contacted: "Contacted",
  in_progress: "In progress",
  closed: "Closed",
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "long",
    timeStyle: "short",
  }).format(new Date(value));
}

export function InquiryDetail({ id }: { id: string }) {
  const [inquiry, setInquiry] = useState<InquiryRow | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const loadInquiry = useCallback(async () => {
    setIsLoading(true);
    setError("");

    try {
      const response = await fetch(`/api/admin/inquiries/${id}`, {
        cache: "no-store",
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        const message =
          typeof payload === "object" &&
          payload !== null &&
          "error" in payload &&
          typeof payload.error === "string"
            ? payload.error
            : "The inquiry could not be loaded.";
        setError(message);
        setInquiry(null);
        return;
      }

      setInquiry((payload as { item: InquiryDetailPayload }).item);
    } catch {
      setError("Could not reach the server. Please try again.");
      setInquiry(null);
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void loadInquiry();
  }, [loadInquiry]);

  async function updateStatus(status: InquiryStatus) {
    if (!inquiry) return;
    setIsSaving(true);
    setError("");

    try {
      const response = await fetch(`/api/admin/inquiries/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        const message =
          typeof payload === "object" &&
          payload !== null &&
          "error" in payload &&
          typeof payload.error === "string"
            ? payload.error
            : "The status could not be updated.";
        setError(message);
        return;
      }

      setInquiry({ ...inquiry, status });
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }

  const brief = inquiry?.project_briefs?.[0];
  const priorityLabel = brief?.priority_label ?? "unknown";
  const priorityScore = brief?.priority_score ?? 0;

  if (isLoading) {
    return <div className="admin-main"><p className="loading-state" role="status">Loading inquiry…</p></div>;
  }

  return (
    <main className="admin-main">
      <Link className="detail-back" href="/admin/inquiries">← All inquiries</Link>
      {error && <p className="form-error" role="alert">{error}</p>}
      {!inquiry ? (
        <p className="empty-state">This inquiry could not be found.</p>
      ) : (
        <>
          <div className="detail-top">
            <div>
              <p className="eyebrow">Received {formatDate(inquiry.created_at)}</p>
              <h1 className="admin-detail-title">{inquiry.name}</h1>
            </div>
            <div className="status-control">
              <label htmlFor="inquiry-status">Follow-up status</label>
              <select
                id="inquiry-status"
                value={inquiry.status}
                disabled={isSaving}
                onChange={(event) => {
                  const nextStatus = INQUIRY_STATUSES.find(
                    (status) => status === event.target.value,
                  );
                  if (nextStatus) {
                    void updateStatus(nextStatus);
                  }
                }}
              >
                {INQUIRY_STATUSES.map((status) => (
                  <option value={status} key={status}>{statusLabels[status]}</option>
                ))}
              </select>
            </div>
          </div>
          <section className="detail-card">
            <div className="detail-meta">
              <div>
                <span>Email</span>
                <a href={`mailto:${inquiry.email}`}>{inquiry.email}</a>
              </div>
              <div>
                <span>Company</span>
                <strong>{inquiry.company || "Not provided"}</strong>
              </div>
              <div>
                <span>Service</span>
                <strong>{inquiry.service?.replaceAll("_", " ") || "Not specified"}</strong>
              </div>
              <div>
                <span>Budget</span>
                <strong>{inquiry.budget_range?.replaceAll("_", " ") || "Not specified"}</strong>
              </div>
              <div>
                <span>Timeline</span>
                <strong>{inquiry.timeline || "Not specified"}</strong>
              </div>
              <div>
                <span>Status</span>
                <strong>{statusLabels[inquiry.status]}</strong>
              </div>
              <div>
                <span>Priority</span>
                <strong className={`status-pill ${priorityTone[priorityLabel] ?? "neutral"}`} data-status={inquiry.status}>
                  {priorityLabel} · {priorityScore}/10
                </strong>
              </div>
              <div>
                <span>Design complexity</span>
                <strong>{brief?.design_complexity ?? "Not rated"}</strong>
              </div>
            </div>
            <div className="detail-section">
              <span className="detail-section-label">Project brief</span>
              <p className="detail-brief">{inquiry.project_brief}</p>
            </div>
            {brief && (
              <div className="detail-section">
                <span className="detail-section-label">Priority details</span>
                <div className="detail-meta">
                  <div><span>Goal</span><strong>{brief.design_goal || "—"}</strong></div>
                  <div><span>Brand message</span><strong>{brief.brand_message || "—"}</strong></div>
                  <div><span>Audience</span><strong>{brief.target_audience || "—"}</strong></div>
                  <div><span>Outcome</span><strong>{brief.desired_outcomes || "—"}</strong></div>
                  <div><span>References</span><strong>{brief.references || "—"}</strong></div>
                  <div><span>Time budget</span><strong>{brief.time_budget || "—"}</strong></div>
                </div>
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}

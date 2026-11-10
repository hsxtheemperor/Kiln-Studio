"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { InquiryRow, InquiryStatus } from "@/lib/supabase/database.types";
import { INQUIRY_STATUSES } from "@/lib/inquiries/schema";
import { PRIORITY_MAX, PRIORITY_UNKNOWN, getPriorityLabel } from "@/lib/project-priority";

type InquiryDetailPayload = Omit<InquiryRow, "similarity_matches"> & {
  similarity_matches?: Array<{
    inquiry_id: string;
    score: number;
    service: InquiryRow["service"];
    status: InquiryStatus;
    priority_score: number;
    reviewed_complexity: number | null;
    actual_hours: number | null;
  }>;
  reference_files?: Array<{
    id: string;
    file_name: string;
    content_type: "image/jpeg" | "image/png" | "image/webp";
    byte_size: number;
    status: "awaiting_upload" | "queued" | "ready" | "rejected";
    signed_url: string | null;
  }>;
  inquiry_briefs?: Array<{
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
  accepted: "Accepted - project created",
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
  const [inquiry, setInquiry] = useState<InquiryDetailPayload | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [reviewedComplexity, setReviewedComplexity] = useState("");
  const [actualHours, setActualHours] = useState("");
  const [reviewNotes, setReviewNotes] = useState("");

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

      const item = (payload as { item: InquiryDetailPayload }).item;
      setInquiry(item);
      setReviewedComplexity(
        item.reviewed_complexity === null ? "" : String(item.reviewed_complexity),
      );
      setActualHours(item.actual_hours === null ? "" : String(item.actual_hours));
      setReviewNotes(item.review_notes ?? "");
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

  async function updatePriority(priority_score: number) {
    if (!inquiry) return;
    setIsSaving(true);
    setError("");

    try {
      const response = await fetch(`/api/admin/inquiries/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priority_score }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        const message =
          typeof payload === "object" &&
          payload !== null &&
          "error" in payload &&
          typeof payload.error === "string"
            ? payload.error
            : "The priority score could not be updated.";
        setError(message);
        return;
      }

      setInquiry({ ...inquiry, priority_score });
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }

  async function saveReview() {
    if (!inquiry) return;
    setIsSaving(true);
    setError("");

    const review = {
      reviewed_complexity:
        reviewedComplexity === "" ? null : Number(reviewedComplexity),
      actual_hours: actualHours === "" ? null : Number(actualHours),
      review_notes: reviewNotes.trim() || null,
    };

    try {
      const response = await fetch(`/api/admin/inquiries/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(review),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        const message =
          typeof payload === "object" &&
          payload !== null &&
          "error" in payload &&
          typeof payload.error === "string"
            ? payload.error
            : "The review could not be saved.";
        setError(message);
        return;
      }

      setInquiry({ ...inquiry, ...review });
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }

  async function removeFromSimilarity() {
    if (!inquiry) return;
    setIsSaving(true);
    setError("");

    try {
      const response = await fetch(`/api/admin/inquiries/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ similarity_opt_in: false }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        const message =
          typeof payload === "object" &&
          payload !== null &&
          "error" in payload &&
          typeof payload.error === "string"
            ? payload.error
            : "The inquiry could not be removed from similarity search.";
        setError(message);
        return;
      }

      setInquiry({
        ...inquiry,
        similarity_opt_in: false,
        similarity_status: "not_requested",
        similarity_matches: [],
      });
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }

  async function retrySimilarity() {
    if (!inquiry) return;
    setIsSaving(true);
    setError("");

    try {
      const response = await fetch(`/api/admin/inquiries/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ similarity_retry: true }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        const message =
          typeof payload === "object" &&
          payload !== null &&
          "error" in payload &&
          typeof payload.error === "string"
            ? payload.error
            : "Similarity processing could not be retried.";
        setError(message);
        return;
      }

      await loadInquiry();
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }

  const brief = inquiry?.inquiry_briefs?.[0];
  const priorityLabel = inquiry ? getPriorityLabel(inquiry.priority_score) : "unknown";
  const similarityMatches = inquiry?.similarity_matches ?? [];
  const reviewedMatches = similarityMatches.filter(
    (match) => match.reviewed_complexity !== null,
  );
  const estimatedComplexity =
    reviewedMatches.length > 0
      ? reviewedMatches.reduce(
          (sum, match) => sum + (match.reviewed_complexity ?? 0),
          0,
        ) / reviewedMatches.length
      : null;
  const measuredMatches = similarityMatches.filter(
    (match) => match.actual_hours !== null,
  );
  const estimatedHours =
    measuredMatches.length > 0
      ? measuredMatches.reduce((sum, match) => sum + (match.actual_hours ?? 0), 0) /
        measuredMatches.length
      : null;

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
                  {priorityLabel} · {inquiry.priority_score}/10
                </strong>
                <label className="sr-only" htmlFor="inquiry-priority">Override priority score</label>
                <select
                  id="inquiry-priority"
                  aria-label="Override priority score"
                  value={inquiry.priority_score}
                  disabled={isSaving}
                  onChange={(event) => void updatePriority(Number(event.target.value))}
                >
                  {Array.from({ length: PRIORITY_MAX - PRIORITY_UNKNOWN + 1 }, (_, score) => (
                    <option key={score} value={score}>{score === PRIORITY_UNKNOWN ? "Unknown" : `${score}/10`}</option>
                  ))}
                </select>
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
            <div className="detail-section">
              <span className="detail-section-label">Human review and outcome</span>
              <p className="form-hint">
                Record the studio&apos;s final complexity rating and actual effort.
                These labels can inform future recommendations only when this
                inquiry was explicitly opted into similarity search.
              </p>
              <div className="form-row">
                <div className="field">
                  <label htmlFor="reviewed-complexity">Reviewed complexity (1–10)</label>
                  <input
                    id="reviewed-complexity"
                    type="number"
                    min={1}
                    max={10}
                    value={reviewedComplexity}
                    disabled={isSaving}
                    onChange={(event) => setReviewedComplexity(event.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="actual-hours">Actual hours</label>
                  <input
                    id="actual-hours"
                    type="number"
                    min={0}
                    max={100000}
                    step="0.25"
                    value={actualHours}
                    disabled={isSaving}
                    onChange={(event) => setActualHours(event.target.value)}
                  />
                </div>
              </div>
              <div className="field">
                <label htmlFor="review-notes">Review notes (optional)</label>
                <textarea
                  id="review-notes"
                  maxLength={1000}
                  value={reviewNotes}
                  disabled={isSaving}
                  onChange={(event) => setReviewNotes(event.target.value)}
                />
              </div>
              <button
                className="button-secondary"
                type="button"
                disabled={isSaving}
                onClick={() => void saveReview()}
              >
                Save review
              </button>
            </div>
            <div className="detail-section">
              <span className="detail-section-label">Request similarity · advisory only</span>
              {!inquiry.similarity_opt_in ? (
                <p className="form-hint">The client did not opt in to similarity search.</p>
              ) : (
                <>
                  <p className="form-hint">
                    Processing status: {inquiry.similarity_status}. Similar requests
                    never change this inquiry&apos;s priority score automatically.
                  </p>
                  {inquiry.similarity_status === "ready" && (
                    <>
                      <div className="detail-meta">
                        <div>
                          <span>Reviewed complexity average</span>
                          <strong>
                            {estimatedComplexity === null
                              ? "Not enough reviewed matches"
                              : `${estimatedComplexity.toFixed(1)} / 10 (${reviewedMatches.length})`}
                          </strong>
                        </div>
                        <div>
                          <span>Measured effort average</span>
                          <strong>
                            {estimatedHours === null
                              ? "Not enough measured matches"
                              : `${estimatedHours.toFixed(1)} hours (${measuredMatches.length})`}
                          </strong>
                        </div>
                      </div>
                      {similarityMatches.length > 0 ? (
                        <ul className="form-hint">
                          {similarityMatches.map((match) => (
                            <li key={match.inquiry_id}>
                              <Link href={`/admin/inquiries/${match.inquiry_id}`}>
                                Similar request · {match.service?.replaceAll("_", " ") || "service unspecified"}
                              </Link>
                              {" · score "}
                              {match.score.toFixed(3)}
                              {" · "}
                              {match.reviewed_complexity === null
                                ? "not reviewed"
                                : `complexity ${match.reviewed_complexity}/10`}
                              {" · "}
                              {match.actual_hours === null
                                ? "hours not recorded"
                                : `${match.actual_hours} hours`}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="form-hint">
                          No earlier opted-in requests are available yet.
                        </p>
                      )}
                    </>
                  )}
                  {(inquiry.similarity_status === "pending" ||
                    inquiry.similarity_status === "failed") && (
                    <button
                      className="button-secondary"
                      type="button"
                      disabled={isSaving}
                      onClick={() => void retrySimilarity()}
                    >
                      Retry similarity processing
                    </button>
                  )}
                  <button
                    className="button-secondary"
                    type="button"
                    disabled={isSaving}
                    onClick={() => void removeFromSimilarity()}
                  >
                    Remove from similarity search
                  </button>
                </>
              )}
            </div>
            {inquiry.reference_files && inquiry.reference_files.length > 0 && (
              <div className="detail-section">
                <span className="detail-section-label">Visual references</span>
                <div className="detail-reference-files">
                  {inquiry.reference_files.map((file) => (
                    <div className="detail-reference-file" key={file.id}>
                      {file.signed_url ? (
                        <a href={file.signed_url} target="_blank" rel="noreferrer">
                          <img src={file.signed_url} alt={file.file_name} />
                          <span>{file.file_name}</span>
                        </a>
                      ) : (
                        <strong>
                          {file.file_name} · {file.status === "rejected" ? "Rejected" : "Processing"}
                        </strong>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}

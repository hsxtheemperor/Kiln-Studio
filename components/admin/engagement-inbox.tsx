"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  EngagementReviewState,
  EngagementRow,
  InquiryBudgetRange,
  InquiryService,
  InquiryStatus,
} from "@/lib/supabase/database.types";

type EngagementItem = EngagementRow & {
  inquiry: {
    id: string;
    name: string;
    email: string;
    company: string | null;
    service: InquiryService | null;
    project_brief: string;
    budget_range: InquiryBudgetRange | null;
    timeline: string | null;
    priority_score: number;
    status: InquiryStatus;
    created_at: string;
  };
  brief: {
    design_goal: string;
    brand_message: string;
    target_audience: string | null;
    desired_outcomes: string | null;
  } | null;
};

type ListResponse = {
  items: EngagementItem[];
  page: number;
  pageSize: number;
  totalCount: number;
};

const reviewLabels: Record<EngagementReviewState, string> = {
  pending: "Awaiting review",
  suitable: "Suitable",
  not_suitable: "Not suitable",
  needs_info: "Needs information",
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(value));
}

export function EngagementInbox({
  canReassign,
  currentUserId,
}: {
  canReassign: boolean;
  currentUserId: string;
}) {
  const [dealLeads, setDealLeads] = useState<Array<{ id: string; label: string }>>([]);
  const [assignees, setAssignees] = useState<Record<string, string>>({});
  const [items, setItems] = useState<EngagementItem[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [page, setPage] = useState(1);
  const [reviewState, setReviewState] = useState("");
  const [totalCount, setTotalCount] = useState(0);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [savingId, setSavingId] = useState("");
  const pageSize = 20;

  useEffect(() => {
    if (!canReassign) return;
    let active = true;
    void fetch("/api/admin/engagements/deal-leads", { cache: "no-store" })
      .then(async (response) => {
        const payload: unknown = await response.json();
        if (!response.ok) {
          throw new Error(
            typeof payload === "object" &&
            payload !== null &&
            "error" in payload &&
            typeof payload.error === "string"
              ? payload.error
              : "Deal leads could not be loaded.",
          );
        }
        if (active) {
          setDealLeads((payload as { items: Array<{ id: string; label: string }> }).items);
        }
      })
      .catch((loadError: unknown) => {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : "Deal leads could not be loaded.");
        }
      });
    return () => {
      active = false;
    };
  }, [canReassign]);

  const loadEngagements = useCallback(async () => {
    setIsLoading(true);
    setError("");

    const query = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
    });
    if (reviewState) query.set("review_state", reviewState);

    try {
      const response = await fetch(`/api/admin/engagements?${query}`, {
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
            : "The engagement queue could not be loaded.";
        setError(message);
        setItems([]);
        setTotalCount(0);
        return;
      }

      const result = payload as ListResponse;
      setItems(result.items);
      setTotalCount(result.totalCount);
      setNotes((current) => Object.fromEntries(
        result.items.map((item) => [
          item.inquiry_id,
          current[item.inquiry_id] ?? item.review_notes ?? "",
        ]),
      ));
    } catch {
      setError("Could not reach the server. Please try again.");
      setItems([]);
      setTotalCount(0);
    } finally {
      setIsLoading(false);
    }
  }, [page, reviewState]);

  useEffect(() => {
    void loadEngagements();
  }, [loadEngagements]);

  async function act(
    item: EngagementItem,
    action:
      | { action: "review"; review_state: Exclude<EngagementReviewState, "pending"> }
      | { action: "claim" }
      | { action: "reassign"; deal_lead_id: string },
  ) {
    setSavingId(item.inquiry_id);
    setError("");
    try {
      const response = await fetch(`/api/admin/engagements/${item.inquiry_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          action.action === "review"
            ? { ...action, notes: notes[item.inquiry_id] ?? "" }
            : action,
        ),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        const message =
          typeof payload === "object" &&
          payload !== null &&
          "error" in payload &&
          typeof payload.error === "string"
            ? payload.error
            : "The engagement could not be updated.";
        setError(message);
        return;
      }
      await loadEngagements();
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setSavingId("");
    }
  }

  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize));

  return (
    <main className="admin-main">
      <div className="admin-heading-row">
        <div>
          <p className="eyebrow">Deal lead workspace</p>
          <h1>Engagement review</h1>
          <p>Review suitable requests before anyone claims the engagement.</p>
        </div>
        <span className="inbox-count">{totalCount} TOTAL</span>
      </div>

      <div className="inbox-toolbar">
        <label className="field" htmlFor="engagement-review-filter">
          <span className="form-hint">Filter by review state</span>
          <select
            id="engagement-review-filter"
            value={reviewState}
            onChange={(event) => {
              setPage(1);
              setReviewState(event.target.value);
            }}
          >
            <option value="">All engagements</option>
            {(["pending", "suitable", "needs_info", "not_suitable"] as const).map((value) => (
              <option value={value} key={value}>{reviewLabels[value]}</option>
            ))}
          </select>
        </label>
        <button className="button-secondary" type="button" onClick={() => void loadEngagements()}>
          Refresh
        </button>
      </div>

      {error && <p className="form-error" role="alert">{error}</p>}
      {isLoading ? (
        <p className="loading-state" role="status">Loading engagements…</p>
      ) : items.length === 0 ? (
        <p className="empty-state">No engagements match this filter.</p>
      ) : (
        <div className="engagement-list">
          {items.map((item) => {
            const isOpenInquiry =
              item.inquiry.status === "new" || item.inquiry.status === "contacted";
            const canReview =
              isOpenInquiry &&
              (canReassign ||
                item.deal_lead_id === null ||
                item.deal_lead_id === currentUserId);
            return (
              <article className="engagement-card" key={item.id}>
                <div className="engagement-card-heading">
                  <div>
                    <p className="card-index">
                      {item.inquiry.service?.replaceAll("_", " ") ?? "Service not specified"}
                      {" · "}Priority {item.inquiry.priority_score}/10
                    </p>
                    <h2>
                      {item.inquiry.name}
                      {item.inquiry.company ? ` · ${item.inquiry.company}` : ""}
                    </h2>
                    <p>{item.inquiry.email} · Received {formatDate(item.inquiry.created_at)}</p>
                  </div>
                  <span className="status-pill" data-status={item.review_state}>
                    {reviewLabels[item.review_state]}
                  </span>
                </div>
                <p className="engagement-brief">{item.inquiry.project_brief}</p>
                {item.brief && (
                  <dl className="engagement-brief-details">
                    <div><dt>Goal</dt><dd>{item.brief.design_goal}</dd></div>
                    <div><dt>Brand message</dt><dd>{item.brief.brand_message}</dd></div>
                  </dl>
                )}
                <label className="field" htmlFor={`review-notes-${item.id}`}>
                  <span>
                    Internal review note{" "}
                    <span className="form-hint">(optional, max 2,000 characters)</span>
                  </span>
                  <textarea
                    id={`review-notes-${item.id}`}
                    maxLength={2000}
                    rows={2}
                    disabled={!canReview}
                    value={notes[item.inquiry_id] ?? ""}
                    onChange={(event) => setNotes({
                      ...notes,
                      [item.inquiry_id]: event.target.value,
                    })}
                  />
                </label>
                <div className="engagement-actions">
                  <button
                    className="button-primary"
                    type="button"
                    disabled={savingId === item.inquiry_id || !canReview}
                    onClick={() => void act(item, { action: "review", review_state: "suitable" })}
                  >
                    Mark suitable
                  </button>
                  <button
                    className="button-secondary"
                    type="button"
                    disabled={savingId === item.inquiry_id || !canReview}
                    onClick={() => void act(item, { action: "review", review_state: "needs_info" })}
                  >
                    Needs information
                  </button>
                  <button
                    className="button-secondary"
                    type="button"
                    disabled={savingId === item.inquiry_id || !canReview}
                    onClick={() => void act(item, { action: "review", review_state: "not_suitable" })}
                  >
                    Not suitable
                  </button>
                  {item.review_state === "suitable" &&
                    !item.deal_lead_id &&
                    isOpenInquiry && (
                    <button
                      className="button-secondary"
                      type="button"
                      disabled={savingId === item.inquiry_id}
                      onClick={() => void act(item, { action: "claim" })}
                    >
                      {savingId === item.inquiry_id ? "Claiming…" : "Claim engagement"}
                    </button>
                  )}
                  {item.deal_lead_id && (
                    <span className="form-hint">
                      {item.deal_lead_id === currentUserId
                        ? "Claimed by you"
                        : "Claimed and assigned"}
                      {item.claimed_at ? ` · ${formatDate(item.claimed_at)}` : ""}
                    </span>
                  )}
                </div>
                {canReassign && item.review_state === "suitable" && isOpenInquiry && (
                  <div className="engagement-assignment">
                    <label className="field" htmlFor={`deal-lead-${item.id}`}>
                      <span>Admin assignment</span>
                      <select
                        id={`deal-lead-${item.id}`}
                        value={assignees[item.inquiry_id] ?? item.deal_lead_id ?? ""}
                        onChange={(event) => setAssignees({
                          ...assignees,
                          [item.inquiry_id]: event.target.value,
                        })}
                      >
                        <option value="">Choose a deal lead</option>
                        {dealLeads.map((dealLead) => (
                          <option value={dealLead.id} key={dealLead.id}>
                            {dealLead.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      className="button-secondary"
                      type="button"
                      disabled={
                        savingId === item.inquiry_id ||
                        !assignees[item.inquiry_id] ||
                        assignees[item.inquiry_id] === item.deal_lead_id
                      }
                      onClick={() => {
                        const dealLeadId = assignees[item.inquiry_id];
                        if (dealLeadId) {
                          void act(item, { action: "reassign", deal_lead_id: dealLeadId });
                        }
                      }}
                    >
                      Assign / reassign
                    </button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      <div className="pagination">
        <span>PAGE {page} OF {pageCount}</span>
        <div>
          <button
            type="button"
            disabled={page <= 1 || isLoading}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          >
            Previous
          </button>{" "}
          <button
            type="button"
            disabled={page >= pageCount || isLoading}
            onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
          >
            Next
          </button>
        </div>
      </div>
    </main>
  );
}

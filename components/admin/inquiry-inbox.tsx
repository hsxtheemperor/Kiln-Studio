"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { InquiryRow, InquiryStatus } from "@/lib/supabase/database.types";
import { INQUIRY_STATUSES } from "@/lib/inquiries/schema";

type InquiryListItem = InquiryRow & {
  project_briefs?: Array<{
    priority_label?: string | null;
    priority_score?: number | null;
  }>;
};

type ListResponse = {
  items: InquiryListItem[];
  page: number;
  pageSize: number;
  totalCount: number;
};

const statusLabels: Record<InquiryStatus, string> = {
  new: "New",
  contacted: "Contacted",
  in_progress: "In progress",
  closed: "Closed",
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
  }).format(new Date(value));
}

export function InquiryInbox() {
  const [items, setItems] = useState<InquiryListItem[]>([]);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [totalCount, setTotalCount] = useState(0);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const pageSize = 20;

  const loadInquiries = useCallback(async () => {
    setIsLoading(true);
    setError("");

    const query = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
    });
    if (status) {
      query.set("status", status);
    }

    try {
      const response = await fetch(`/api/admin/inquiries?${query}`, {
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
            : "The inquiry list could not be loaded.";
        setError(message);
        setItems([]);
        setTotalCount(0);
        return;
      }

      const data = payload as ListResponse;
      setItems(data.items);
      setTotalCount(data.totalCount);
    } catch {
      setError("Could not reach the server. Please try again.");
      setItems([]);
      setTotalCount(0);
    } finally {
      setIsLoading(false);
    }
  }, [page, status]);

  useEffect(() => {
    void loadInquiries();
  }, [loadInquiries]);

  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize));

  return (
    <div className="admin-main">
      <div className="admin-heading-row">
        <div>
          <p className="eyebrow">Studio workspace</p>
          <h1>Inquiries</h1>
          <p>Every good collaboration starts somewhere.</p>
        </div>
        <span className="inbox-count">{totalCount} TOTAL</span>
      </div>

      <div className="inbox-toolbar">
        <label className="field" htmlFor="status-filter">
          <span className="form-hint">Filter by status</span>
          <select
            id="status-filter"
            value={status}
            onChange={(event) => {
              setPage(1);
              setStatus(event.target.value);
            }}
          >
            <option value="">All inquiries</option>
            {INQUIRY_STATUSES.map((value) => (
              <option value={value} key={value}>{statusLabels[value]}</option>
            ))}
          </select>
        </label>
        <button className="button-secondary" type="button" onClick={() => void loadInquiries()}>
          Refresh
        </button>
      </div>

      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="inbox-table-wrap">
        {isLoading ? (
          <p className="loading-state" role="status">Loading inquiries…</p>
        ) : items.length === 0 ? (
          <p className="empty-state">No inquiries here yet.</p>
        ) : (
          <table className="inbox-table">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Project</th>
                <th scope="col">Received</th>
                <th scope="col">Priority</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {items.map((inquiry) => {
                const priority = inquiry.project_briefs?.[0];
                const priorityLabel = priority?.priority_label ?? "unknown";
                const priorityScore = priority?.priority_score ?? 0;

                return (
                  <tr key={inquiry.id}>
                    <td>
                      <Link className="inbox-open" href={`/admin/inquiries/${inquiry.id}`}>
                        <span className="inbox-name">{inquiry.name}</span>
                      </Link>
                      <span className="inbox-brief">{inquiry.email}</span>
                    </td>
                    <td><span className="inbox-brief">{inquiry.project_brief}</span></td>
                    <td>{formatDate(inquiry.created_at)}</td>
                    <td>
                      <span className="status-pill" data-status={priorityLabel}>
                        {priorityLabel} · {priorityScore}/10
                      </span>
                    </td>
                    <td>
                      <span className="status-pill" data-status={inquiry.status}>
                        {statusLabels[inquiry.status]}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

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
    </div>
  );
}

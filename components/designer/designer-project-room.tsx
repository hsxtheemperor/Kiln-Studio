"use client";

import { useEffect, useState } from "react";

type Message = {
  id: string;
  inquiry_id: string;
  sender_type: "client" | "designer" | "team";
  sender_id: string | null;
  sender_name: string;
  body: string;
  created_at: string;
};

export function DesignerProjectRoom({ inquiryId }: { inquiryId: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  async function loadMessages(before?: string) {
    if (before) setIsLoadingOlder(true);
    else setIsLoading(true);
    setError("");

    try {
      const cursor = before ? `&before=${encodeURIComponent(before)}` : "";
      const response = await fetch(
        `/api/designer/messages?inquiry_id=${encodeURIComponent(inquiryId)}${cursor}`,
        { cache: "no-store" },
      );
      const payload: unknown = await response.json();

      if (!response.ok) {
        const message =
          typeof payload === "object" && payload !== null && "error" in payload && typeof payload.error === "string"
            ? payload.error
            : "Messages could not be loaded.";
        setError(message);
        return;
      }

      if (typeof payload !== "object" || payload === null || !("messages" in payload)) {
        throw new Error("The message feed returned an invalid response.");
      }
      const result = payload as {
        messages?: unknown;
        hasMore?: unknown;
        nextCursor?: unknown;
      };
      const list = Array.isArray(result.messages) ? result.messages as Message[] : null;
      if (!list || typeof result.hasMore !== "boolean") {
        throw new Error("The message feed returned an invalid response.");
      }
      setMessages((current) => before ? [...list, ...current] : list);
      setHasMore(result.hasMore);
      setNextCursor(typeof result.nextCursor === "string" ? result.nextCursor : null);
    } catch {
      setError("The message feed could not be reached.");
    } finally {
      if (before) setIsLoadingOlder(false);
      else setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadMessages();
  }, [inquiryId]);

  async function sendMessage() {
    const trimmed = draft.trim();
    if (!trimmed) {
      return;
    }

    setIsSending(true);
    setError("");

    try {
      const response = await fetch("/api/designer/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inquiry_id: inquiryId, body: trimmed }),
      });

      const payload: unknown = await response.json();
      if (!response.ok) {
        const message =
          typeof payload === "object" && payload !== null && "error" in payload && typeof payload.error === "string"
            ? payload.error
            : "The message could not be sent.";
        setError(message);
        return;
      }

      const message = (payload as { message?: Message }).message;
      if (message) {
        setMessages((currentMessages) =>
          currentMessages.some((current) => current.id === message.id)
            ? currentMessages
            : [...currentMessages, message],
        );
      }
      setDraft("");
    } catch {
      setError("The message could not be sent right now.");
    } finally {
      setIsSending(false);
    }
  }

  return (
    <div className="designer-project-room">
      <div className="designer-room-header">
        <h3>Project room</h3>
        <span>{messages.length} messages</span>
      </div>

      {error && <p className="form-error" role="alert">{error}</p>}

      {isLoading ? (
        <p className="loading-state" role="status">Loading messages…</p>
      ) : (
        <div className="designer-message-list">
          {hasMore && nextCursor && (
            <button
              className="button-secondary"
              type="button"
              onClick={() => void loadMessages(nextCursor)}
              disabled={isLoadingOlder}
            >
              {isLoadingOlder ? "Loading…" : "Load older messages"}
            </button>
          )}
          {messages.length === 0 && <p className="empty-state">No messages yet for this request.</p>}
          {messages.map((message) => (
            <div key={message.id} className={`designer-message ${message.sender_type === "designer" ? "designer" : "team"}`}>
              <div className="message-meta">
                <strong>{message.sender_name}</strong>
                <span>{message.sender_type}</span>
                <time>{new Date(message.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>
              </div>
              <p>{message.body}</p>
            </div>
          ))}
        </div>
      )}

      <div className="designer-room-composer">
        <textarea
          aria-label="Write a message to the project room"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          rows={4}
          placeholder="Share an update, task, or client note…"
        />
        <button className="button-primary" type="button" onClick={() => void sendMessage()} disabled={isSending}>
          {isSending ? "Sending…" : "Send message"}
        </button>
      </div>
    </div>
  );
}

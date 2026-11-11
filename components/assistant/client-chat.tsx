"use client";

import { useState } from "react";

type Message = { role: "visitor" | "assistant"; text: string };

function getErrorMessage(payload: unknown, fallback: string) {
  return typeof payload === "object" &&
    payload !== null &&
    "error" in payload &&
    typeof payload.error === "string"
    ? payload.error
    : fallback;
}

export function ClientChat({ compact = false }: { compact?: boolean }) {
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submitQuestion(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const question = message.trim();
    if (!question || busy) return;

    setBusy(true);
    setError("");
    setMessages((current) => [...current, { role: "visitor", text: question }]);
    setMessage("");

    try {
      const startResponse = await fetch("/api/client-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: question,
          history: messages.slice(-8).map((entry) => ({
            role: entry.role === "visitor" ? "user" : "model",
            text: entry.text,
          })),
        }),
      });
      const startPayload: unknown = await startResponse.json();
      if (!startResponse.ok) {
        throw new Error(getErrorMessage(startPayload, "The assistant could not start."));
      }
      if (
        typeof startPayload !== "object" ||
        startPayload === null ||
        !("requestId" in startPayload) ||
        typeof startPayload.requestId !== "string"
      ) {
        throw new Error("The assistant returned an invalid request ID.");
      }

      const requestId = startPayload.requestId;
      const deadline = Date.now() + 30_000;
      let pollDelay = 500;
      while (Date.now() < deadline) {
        await new Promise((resolve) =>
          window.setTimeout(resolve, Math.min(pollDelay, deadline - Date.now())),
        );
        if (Date.now() >= deadline) break;
        const resultResponse = await fetch(
          `/api/client-chat?id=${encodeURIComponent(requestId)}`,
          { cache: "no-store" },
        );
        const resultPayload: unknown = await resultResponse.json();
        if (!resultResponse.ok) {
          throw new Error(getErrorMessage(resultPayload, "The assistant response is unavailable."));
        }
        const answer =
          typeof resultPayload === "object" &&
          resultPayload !== null &&
          "answer" in resultPayload
            ? resultPayload.answer
            : undefined;
        if (
          typeof resultPayload === "object" &&
          resultPayload !== null &&
          "status" in resultPayload &&
          resultPayload.status === "ready" &&
          typeof answer === "string"
        ) {
          setMessages((current) => [...current, { role: "assistant", text: answer }]);
          return;
        }
        pollDelay = Math.min(pollDelay * 2, 5_000);
      }
      throw new Error("The assistant is taking longer than expected. Please try again.");
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "The assistant could not answer right now.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`assistant-card${compact ? " assistant-card-compact" : ""}`}>
      <p className="assistant-disclaimer">
        A Gemini-powered guide uses public studio information only. Your question and answer are
        saved for future FAQ review without account or IP metadata. Submitted text is not
        automatically scrubbed, so don&apos;t include names, contact details, or sensitive
        information.
      </p>
      <div className="assistant-thread" aria-live="polite">
        {messages.length === 0 ? (
          <p className="empty-state">Ask about services, the concept work, or how to start a project.</p>
        ) : (
          messages.map((entry, index) => (
            <article className={`assistant-message assistant-message-${entry.role}`} key={index}>
              <strong>{entry.role === "visitor" ? "You" : "Studio assistant"}</strong>
              <p>{entry.text}</p>
            </article>
          ))
        )}
        {busy && <p className="assistant-thinking" role="status">Thinking…</p>}
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <form className="assistant-composer" onSubmit={submitQuestion}>
        <label htmlFor="assistant-question">Your question</label>
        <textarea
          id="assistant-question"
          value={message}
          maxLength={1000}
          onChange={(event) => setMessage(event.target.value)}
          disabled={busy}
          required
          rows={3}
        />
        <button className="button-primary" type="submit" disabled={busy || !message.trim()}>
          {busy ? "Finding an answer…" : "Ask"}
        </button>
      </form>
    </div>
  );
}

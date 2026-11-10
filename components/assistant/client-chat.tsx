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

export function ClientChat() {
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
        body: JSON.stringify({ message: question }),
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
      while (Date.now() < deadline) {
        await new Promise((resolve) => window.setTimeout(resolve, 1_000));
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
    <div className="assistant-card">
      <p className="assistant-disclaimer">
        This demo assistant answers from public studio information only. Questions are processed by
        OpenAI and Upstash Workflow; transient responses expire after 10 minutes and are not saved as
        studio conversation history. Don&apos;t share sensitive information.
      </p>
      <div className="assistant-thread" aria-live="polite">
        {messages.length === 0 ? (
          <p className="empty-state">Try asking about services, project references, or how to start.</p>
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
          {busy ? "Waiting for answer…" : "Ask"}
        </button>
      </form>
    </div>
  );
}

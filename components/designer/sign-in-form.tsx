"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { buildSessionRedirect } from "@/lib/session/session-url";

export function DesignerSignInForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/designer/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        const payload: unknown = await response.json();
        const message =
          typeof payload === "object" &&
          payload !== null &&
          "error" in payload &&
          typeof payload.error === "string"
            ? payload.error
            : "Sign-in failed. Please try again.";

        setError(message);
        setIsSubmitting(false);
        return;
      }

      const redirectTarget = buildSessionRedirect("/designer", email);
      router.replace(redirectTarget);
      router.refresh();
    } catch {
      setError("Could not reach the server. Please try again.");
      setIsSubmitting(false);
    }
  }

  return (
    <form className="sign-in-form" onSubmit={handleSubmit}>
      <div className="field">
        <label htmlFor="designer-email">Email address</label>
        <input
          id="designer-email"
          type="email"
          value={email}
          autoComplete="username"
          required
          onChange={(event) => setEmail(event.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="designer-password">Password</label>
        <input
          id="designer-password"
          type="password"
          value={password}
          autoComplete="current-password"
          required
          onChange={(event) => setPassword(event.target.value)}
        />
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="button-primary" type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Signing in…" : "Sign in"} <span aria-hidden="true">↗</span>
      </button>
      <Link className="sign-in-back" href="/">
        ← Back to home
      </Link>
    </form>
  );
}

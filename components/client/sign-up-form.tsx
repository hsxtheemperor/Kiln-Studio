"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export function ClientSignUpForm() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/client/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "sign-up",
          full_name: fullName,
          company,
          email,
          password,
        }),
      });

      if (!response.ok) {
        const payload: unknown = await response.json();
        const message =
          typeof payload === "object" &&
          payload !== null &&
          "error" in payload &&
          typeof payload.error === "string"
            ? payload.error
            : "Account creation failed. Please try again.";
        setError(message);
        setIsSubmitting(false);
        return;
      }

      const payload: unknown = await response.json();
      const successMessage =
        typeof payload === "object" &&
        payload !== null &&
        "message" in payload &&
        typeof payload.message === "string"
          ? payload.message
          : "Your account is ready.";

      if (response.status === 202) {
        setError("");
        router.replace("/account/sign-in");
        router.refresh();
        return;
      }

      router.replace("/account/projects");
      router.refresh();
    } catch {
      setError("Could not reach the server. Please try again.");
      setIsSubmitting(false);
    }
  }

  return (
    <form className="sign-in-form" onSubmit={handleSubmit}>
      <div className="field">
        <label htmlFor="client-name">Full name</label>
        <input
          id="client-name"
          name="full_name"
          autoComplete="name"
          maxLength={120}
          required
          value={fullName}
          onChange={(event) => setFullName(event.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="client-company">Company (optional)</label>
        <input
          id="client-company"
          name="company"
          autoComplete="organization"
          maxLength={120}
          value={company}
          onChange={(event) => setCompany(event.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="client-signup-email">Email address</label>
        <input
          id="client-signup-email"
          name="email"
          type="email"
          autoComplete="username"
          maxLength={254}
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="client-signup-password">Password</label>
        <input
          id="client-signup-password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          maxLength={128}
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="button-primary" type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Creating account…" : "Create account"} <span aria-hidden="true">↗</span>
      </button>
      <p className="admin-notice">
        Already have an account? <Link href="/account/sign-in">Sign in.</Link>
      </p>
      <Link className="sign-in-back" href="/">
        ← Back to Kiln Studio
      </Link>
    </form>
  );
}

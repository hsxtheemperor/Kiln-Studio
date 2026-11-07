"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";

export function AdminFrame({ children }: { children: ReactNode }) {
  const [error, setError] = useState("");
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    setSigningOut(true);
    setError("");

    try {
      const response = await fetch("/api/admin/auth", { method: "DELETE" });
      if (!response.ok) {
        setError("Sign-out could not be completed. Please try again.");
        setSigningOut(false);
        return;
      }

      window.location.assign("/admin/sign-in");
    } catch {
      setError("Could not reach the server. Please try again.");
      setSigningOut(false);
    }
  }

  return (
    <div className="admin-page">
      <header className="admin-header">
        <Link className="admin-brand" href="/admin">
          <strong className="brand-mark">
            <span className="brand-symbol" aria-hidden="true">k</span>
            kiln studio
          </strong>
          <span>Private studio</span>
        </Link>
        <nav className="admin-nav" aria-label="Studio navigation">
          <Link href="/admin">Dashboard</Link>
          <Link href="/admin/inquiries">Inquiries</Link>
          <button
            className="text-button"
            type="button"
            onClick={signOut}
            disabled={signingOut}
          >
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </nav>
      </header>
      {error && <p className="form-error" role="alert">{error}</p>}
      {children}
    </div>
  );
}

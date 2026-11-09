"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export function ConfirmationGate() {
  const router = useRouter();
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [referenceFilesPending, setReferenceFilesPending] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem("kiln-inquiry-saved") !== "true") {
      router.replace("/inquiry");
      return;
    }

    sessionStorage.removeItem("kiln-inquiry-saved");
    setReferenceFilesPending(
      sessionStorage.getItem("kiln-inquiry-reference-files-pending") === "true",
    );
    sessionStorage.removeItem("kiln-inquiry-reference-files-pending");
    setIsConfirmed(true);
  }, [router]);

  if (!isConfirmed) {
    return <p className="loading-state" role="status">Checking your submission…</p>;
  }

  return (
    <section className="confirmation-panel">
      <span className="confirmation-mark" aria-hidden="true">✓</span>
      <p className="eyebrow">Safely received</p>
      <h1 className="page-title">Thanks for the <em>note.</em></h1>
      <p className="page-description">
        Your inquiry was saved. This is a fictional studio demo, so nobody is
        monitoring submissions as real client requests.
      </p>
      {referenceFilesPending && (
        <p className="form-hint" role="status">
          Your reference images are received and still being checked. They will
          appear in the inquiry once processing finishes.
        </p>
      )}
      <Link className="button-secondary" href="/">Back to the studio</Link>
    </section>
  );
}

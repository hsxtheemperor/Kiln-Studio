import Link from "next/link";
import { DesignerSignInForm } from "@/components/designer/sign-in-form";

export default function DesignerSignInPage() {
  return (
    <main className="sign-in-page">
      <section className="sign-in-card">
        <Link className="brand-mark" href="/" aria-label="Kiln Studio home">
          <span className="brand-symbol" aria-hidden="true">k</span>
          <span>kiln studio</span>
        </Link>
        <h1>Designer access.</h1>
        <p>Review incoming briefs, score priorities, and track what the studio needs to tackle next.</p>
        <DesignerSignInForm />
      </section>
    </main>
  );
}

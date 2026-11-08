import Link from "next/link";
import { ClientSignInForm } from "@/components/client/sign-in-form";

export default function ClientSignInPage() {
  return (
    <main className="sign-in-page">
      <section className="sign-in-card">
        <Link className="brand-mark" href="/" aria-label="Kiln Studio home">
          <span className="brand-symbol" aria-hidden="true">✦</span>
          <span>Kiln Studio</span>
        </Link>
        <h1>Client access.</h1>
        <p>Sign in to review your project requests and continue with a new brief.</p>
        <ClientSignInForm />
      </section>
    </main>
  );
}

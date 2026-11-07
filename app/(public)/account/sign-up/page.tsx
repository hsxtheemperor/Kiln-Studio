import Link from "next/link";
import { ClientSignUpForm } from "@/components/client/sign-up-form";

export default function ClientSignUpPage() {
  return (
    <main className="sign-in-page">
      <section className="sign-in-card">
        <Link className="brand-mark" href="/" aria-label="Kiln Studio home">
          <span className="brand-symbol" aria-hidden="true">k</span>
          <span>kiln studio</span>
        </Link>
        <h1>Create your client account.</h1>
        <p>Save your details and keep track of the projects you request from the studio.</p>
        <ClientSignUpForm />
      </section>
    </main>
  );
}

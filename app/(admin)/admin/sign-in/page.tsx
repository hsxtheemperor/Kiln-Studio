import Link from "next/link";
import { SignInForm } from "@/components/admin/sign-in-form";

export default function AdminSignInPage() {
  return (
    <main className="sign-in-page">
      <section className="sign-in-card">
        <Link className="brand-mark" href="/" aria-label="Kiln Studio home">
          <span className="brand-symbol" aria-hidden="true">✦</span>
          <span>Kiln Studio</span>
        </Link>
        <h1>Welcome back.</h1>
        <p>Sign in to the private studio workspace.</p>
        <SignInForm />
      </section>
    </main>
  );
}

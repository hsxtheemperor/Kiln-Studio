import Link from "next/link";
import { SupportChatWidget } from "@/components/assistant/support-chat-widget";

export default function PublicLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      <div className="demo-bar">
        A FICTIONAL STUDIO DEMO · PLEASE DON&apos;T SHARE SENSITIVE INFORMATION
      </div>
      <div className="site-shell">
        <header className="site-header">
          <Link className="brand-mark" href="/" aria-label="Kiln Studio home">
            <span className="brand-symbol" aria-hidden="true">✦</span>
            <span>Kiln Studio</span>
          </Link>
          <nav className="site-nav" aria-label="Main navigation">
            <Link href="/services">Services</Link>
            <Link href="/about">About</Link>
            <Link href="/work">Selected work</Link>
            <Link href="/account/sign-in">Client portal</Link>
            <Link className="nav-cta" href="/inquiry">Start a project ↗</Link>
          </nav>
        </header>
        <main>{children}</main>
        <SupportChatWidget />
        <footer className="site-footer">
          <span>© Kiln Studio · fictional concept studio</span>
          <div className="site-footer-links">
            <Link href="/about">About</Link>
            <Link href="/assistant">Ask the studio</Link>
            <Link href="/account/projects">My projects</Link>
            <Link href="/admin/sign-in">Studio sign in</Link>
          </div>
        </footer>
      </div>
    </>
  );
}

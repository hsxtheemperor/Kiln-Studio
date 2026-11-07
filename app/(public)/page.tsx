import Link from "next/link";

export default function HomePage() {
  return (
    <>
      <section className="home-hero">
        <div>
          <p className="eyebrow">Independent design studio · Est. 2025</p>
          <h1 className="hero-title">
            Make room for <em>what&apos;s next.</em>
          </h1>
          <p className="hero-copy">
            We shape thoughtful identities and digital experiences for people
            building a more considered future.
          </p>
          <Link className="button-link" href="/inquiry">
            Tell us what you&apos;re making <span aria-hidden="true">↗</span>
          </Link>
        </div>
        <div className="hero-art" role="img" aria-label="Abstract sculptural clay vessel">
          <div className="clay-form" />
          <span className="art-note">Objects for a new beginning · 01</span>
        </div>
      </section>

      <section className="section-rule">
        <p className="section-label">A little about us</p>
        <p className="section-copy">
          Good design doesn&apos;t shout. It <em>makes things clear,</em> gives
          good ideas a place to grow, and helps people feel something.
        </p>
      </section>

      <section className="service-strip" aria-label="Studio services">
        <article className="service-item">
          <span>01 / Identity</span>
          <h3>Brand worlds</h3>
        </article>
        <article className="service-item">
          <span>02 / Digital</span>
          <h3>Web experiences</h3>
        </article>
        <article className="service-item">
          <span>03 / Product</span>
          <h3>Useful interfaces</h3>
        </article>
      </section>
    </>
  );
}

import Link from "next/link";

const services = [
  {
    number: "01",
    title: "Brand identity",
    description:
      "A clear point of view, a distinct visual language, and the tools to show up consistently.",
    list: "Strategy · Naming · Identity systems",
  },
  {
    number: "02",
    title: "Web design",
    description:
      "Warm, thoughtful digital spaces that make the important things easy to find.",
    list: "Art direction · UX · Website design",
  },
  {
    number: "03",
    title: "Product design",
    description:
      "Useful interfaces that balance real customer needs with a team's ambition.",
    list: "Product thinking · UI · Prototyping",
  },
];

export default function ServicesPage() {
  return (
    <>
      <section className="page-intro">
        <p className="eyebrow">What we do</p>
        <h1 className="page-title">
          The right idea, <em>well made.</em>
        </h1>
        <p className="page-description">
          A small, collaborative practice for early-stage teams ready to make
          their next move with intention.
        </p>
      </section>
      <section className="service-cards" aria-label="Design services">
        {services.map((service) => (
          <article className="service-card" key={service.number}>
            <span className="card-index">{service.number} / SERVICE</span>
            <h2>{service.title}</h2>
            <p>{service.description}</p>
            <p className="form-hint">{service.list}</p>
          </article>
        ))}
      </section>
      <section className="section-rule">
        <p className="section-label">Have a good one?</p>
        <div>
          <p className="section-copy">Let&apos;s give it a strong start.</p>
          <Link className="button-link" href="/inquiry">Tell us about it ↗</Link>
        </div>
      </section>
    </>
  );
}

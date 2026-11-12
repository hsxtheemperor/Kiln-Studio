import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "About | Kiln Studio",
  description:
    "Meet Kiln Studio, a fictional design-studio concept built around clarity, care, and useful creative work.",
};

const principles = [
  {
    number: "01",
    title: "Clarity before decoration",
    description:
      "Start with what needs to be understood. Make the visual choices serve the idea, not distract from it.",
  },
  {
    number: "02",
    title: "Useful can be beautiful",
    description:
      "A thoughtful experience should feel good and help someone do what they came to do.",
  },
  {
    number: "03",
    title: "Make room to grow",
    description:
      "Build flexible foundations that give good ideas space to change as people and needs change.",
  },
];

const process = [
  {
    number: "01",
    title: "Listen closely",
    description:
      "Get to the heart of the problem, the people it affects, and what a better outcome could look like.",
  },
  {
    number: "02",
    title: "Find the shape",
    description:
      "Explore a clear direction, then bring the identity, content, and experience into the same conversation.",
  },
  {
    number: "03",
    title: "Make it real",
    description:
      "Turn the chosen idea into considered details and useful tools that feel ready for the next step.",
  },
];

export default function AboutPage() {
  return (
    <>
      <section className="page-intro about-intro">
        <p className="eyebrow">A thoughtful studio, by design</p>
        <h1 className="page-title">
          Good work starts with <em>a good question.</em>
        </h1>
        <p className="page-description">
          Kiln Studio is a fictional independent design practice exploring how
          clear thinking and considered craft can help good ideas take shape.
        </p>
      </section>

      <section className="about-story">
        <p className="section-label">Why “Kiln”?</p>
        <div className="about-story-copy">
          <p className="about-statement">
            A kiln gives raw material the time and conditions to become
            something <em>lasting.</em>
          </p>
          <p>
            We use that idea as a creative metaphor: listen before making,
            shape with intention, and give every detail a reason to be there.
            The studio brings brand identity, web design, and product thinking
            together around the problem at hand.
          </p>
          <p>
            The portfolio is a collection of fictional concepts rather than
            client commissions. Kiln is a design-led demo built to show both a
            studio’s public face and the digital tools that can support its
            work behind the scenes.
          </p>
        </div>
      </section>

      <section className="about-principles" aria-labelledby="principles-title">
        <div className="about-section-heading">
          <p className="eyebrow">A few things we believe</p>
          <h2 id="principles-title" className="about-section-title">
            A good foundation changes <em>everything.</em>
          </h2>
        </div>
        <div className="about-card-grid">
          {principles.map((principle) => (
            <article className="about-card" key={principle.number}>
              <span className="card-index">{principle.number} / PRINCIPLE</span>
              <h3>{principle.title}</h3>
              <p>{principle.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="about-process" aria-labelledby="process-title">
        <div className="about-section-heading">
          <p className="eyebrow">How we approach the work</p>
          <h2 id="process-title" className="about-section-title">
            Thoughtful from <em>first thought to final detail.</em>
          </h2>
        </div>
        <ol className="about-process-list">
          {process.map((step) => (
            <li className="about-process-step" key={step.number}>
              <span className="about-step-number">{step.number}</span>
              <h3>{step.title}</h3>
              <p>{step.description}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="about-cta">
        <p className="eyebrow">Have something taking shape?</p>
        <h2 className="about-section-title">
          Let&apos;s give it <em>a thoughtful start.</em>
        </h2>
        <p>
          Share the idea, the question, or the thing you&apos;re still figuring
          out.
        </p>
        <Link className="button-link" href="/inquiry">
          Tell us what you&apos;re making <span aria-hidden="true">↗</span>
        </Link>
      </section>
    </>
  );
}

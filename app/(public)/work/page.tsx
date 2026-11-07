const concepts = [
  { name: "Forma Objects", letter: "F", category: "Concept identity · Home objects" },
  { name: "Fieldnotes", letter: "f", category: "Concept digital · Climate journal" },
  { name: "Common Ground", letter: "C", category: "Concept product · Local food" },
];

export default function WorkPage() {
  return (
    <>
      <section className="page-intro">
        <p className="eyebrow">A few made-up things</p>
        <h1 className="page-title">
          Ideas, in <em>good company.</em>
        </h1>
        <p className="page-description">
          These self-created concepts show the kind of thoughtful work we love
          to make. They are fictional—not client projects.
        </p>
      </section>
      <section className="work-cards" aria-label="Fictional concept work">
        {concepts.map((concept, index) => (
          <article className="work-card" key={concept.name}>
            <span className="card-index">0{index + 1} / CONCEPT</span>
            <span className="work-art" aria-hidden="true">{concept.letter}</span>
            <h2>{concept.name}</h2>
            <p>{concept.category}</p>
          </article>
        ))}
      </section>
    </>
  );
}

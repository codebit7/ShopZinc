import { FiAlertCircle } from "react-icons/fi";
import "./info.css";

// Shared shell for the help/legal pages, so all five read the same and the TOC
// always matches the real headings (it is built from the same `sections` list).
// sections: [{ id, title, body }] — id becomes the anchor for the "On this page" links.
const InfoPage = ({ title, subtitle, updated, template = false, intro, sections = [], toc = true }) => {
  const showToc = toc && sections.length > 2;

  return (
    <div className={`info container${showToc ? "" : " info--single"}`}>
      <header className="info-head">
        <h1 className="info-title">{title}</h1>
        {subtitle && <p className="info-subtitle">{subtitle}</p>}
        {updated && <p className="info-updated">Last updated: {updated}</p>}
        {/* Legal text here is a starting point, not legal advice; say so where people will see it. */}
        {template}
      </header>

      {showToc && (
        <nav className="info-toc" aria-label="On this page">
          <p className="info-toc-title">On this page</p>
          <ol>
            {sections.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`}>{s.title}</a>
              </li>
            ))}
          </ol>
        </nav>
      )}

      <article className="info-body">
        {intro}
        {sections.map((s) => (
          <section key={s.id} id={s.id} className="info-section">
            <h2>{s.title}</h2>
            {s.body}
          </section>
        ))}
      </article>
    </div>
  );
};

export default InfoPage;

import { Link } from "react-router-dom";
import "./notFoundPage.css";

// Real 404 inside the storefront layout, so a lost visitor still has the navbar and footer.
const NotFoundPage = () => (
  <section className="nf-page">
    <p className="nf-code">404</p>
    <h1 className="nf-title">Page not found</h1>
    <p className="nf-text">The page you are looking for does not exist or has moved.</p>
    <div className="nf-actions">
      <Link to="/" className="nf-btn nf-btn--primary">Back to home</Link>
      <Link to="/filter" className="nf-btn">Browse products</Link>
    </div>
  </section>
);

export default NotFoundPage;
